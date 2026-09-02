import { describe, expect, it } from "vitest";
import {
  PRINTER_LIMITS,
  PRINTER_PROFILE_DEFAULTS,
  activeCorrections,
  bedWarnings,
  calibrationProposal,
  compensate,
  compensationNotes,
  correctionFilenameTag,
  correctionRangeMessages,
  extentsFromBounds,
  hasCorrection,
  normalizePrinterProfile,
  thinWallIssues,
  validatePrinterProfile,
  wallLikeKeys,
  withCorrectionTag,
  type PrinterProfileV1,
} from "../lib/printer-profile";
import {
  DRAWER_TRAY_DEFAULTS,
  deriveDimensions,
  drawerTray,
} from "../lib/products/drawer-tray";

function profile(overrides: Partial<PrinterProfileV1> = {}): PrinterProfileV1 {
  return { ...PRINTER_PROFILE_DEFAULTS, ...overrides };
}

const extentsOf = (parameters: Parameters<typeof drawerTray.boundsContract>[0]) =>
  extentsFromBounds(drawerTray.boundsContract(parameters));

describe("printer profile normalization", () => {
  it("gives the documented defaults for empty input", () => {
    expect(normalizePrinterProfile(undefined)).toEqual({
      version: 1,
      name: "My printer",
      bedWidth: 220,
      bedDepth: 220,
      bedHeight: 250,
      nozzleDiameter: 0.4,
      correctionX: 0,
      correctionY: 0,
    });
  });

  it("reads numeric text and rounds to 0.001 mm", () => {
    const normalized = normalizePrinterProfile({
      bedWidth: "256",
      correctionX: 0.12345,
      correctionY: -0.2,
    });
    expect(normalized.bedWidth).toBe(256);
    expect(normalized.correctionX).toBe(0.123);
    expect(normalized.correctionY).toBe(-0.2);
  });

  it("replaces an unreadable value with the default", () => {
    const normalized = normalizePrinterProfile({
      bedDepth: "wide",
      nozzleDiameter: Number.NaN,
      correctionX: Number.POSITIVE_INFINITY,
      name: 7,
    });
    expect(normalized.bedDepth).toBe(220);
    expect(normalized.nozzleDiameter).toBe(0.4);
    expect(normalized.correctionX).toBe(0);
    expect(normalized.name).toBe("My printer");
  });

  it("clamps a value outside its limit", () => {
    const normalized = normalizePrinterProfile({ correctionX: 900, bedWidth: -4 });
    expect(normalized.correctionX).toBe(PRINTER_LIMITS.correctionX.max);
    expect(normalized.bedWidth).toBe(PRINTER_LIMITS.bedWidth.min);
  });

  it("trims the name and keeps an empty name from replacing the default", () => {
    expect(normalizePrinterProfile({ name: "  Bench one  " }).name).toBe("Bench one");
    expect(normalizePrinterProfile({ name: "   " }).name).toBe("My printer");
  });
});

describe("printer profile validation", () => {
  it("reports nothing for a clean profile", () => {
    expect(validatePrinterProfile(PRINTER_PROFILE_DEFAULTS)).toEqual([]);
  });

  it("reports a value that is not a number", () => {
    expect(validatePrinterProfile({ bedWidth: "wide" })).toEqual([
      { field: "bedWidth", message: "Bed width must be a number." },
    ]);
  });

  it("reports a value outside its limit with the limit in the message", () => {
    const issues = validatePrinterProfile({ correctionY: 40 });
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("correctionY");
    expect(issues[0].message).toBe("Y correction must be between -25 and 25 mm.");
  });

  it("ignores a field that is not present", () => {
    expect(validatePrinterProfile({ correctionX: 0.5 })).toEqual([]);
  });
});

describe("compensate", () => {
  const compensable = drawerTray.compensable;

  it("returns parameters deep-equal to the input with a zero correction", () => {
    const result = compensate(DRAWER_TRAY_DEFAULTS, profile(), compensable);
    expect(result).toEqual(DRAWER_TRAY_DEFAULTS);
  });

  it("returns parameters deep-equal to the input with no compensable list", () => {
    const result = compensate(
      DRAWER_TRAY_DEFAULTS,
      profile({ correctionX: 0.5, correctionY: 0.3 }),
      undefined,
    );
    expect(result).toEqual(DRAWER_TRAY_DEFAULTS);
  });

  it("adds the X correction to X parameters and the Y correction to Y parameters", () => {
    const result = compensate(
      DRAWER_TRAY_DEFAULTS,
      profile({ correctionX: 0.5, correctionY: -0.2 }),
      compensable,
    );
    expect(result.drawerWidth).toBe(300.5);
    expect(result.drawerDepth).toBe(199.8);
  });

  it("changes no parameter outside the compensable lists", () => {
    const result = compensate(
      DRAWER_TRAY_DEFAULTS,
      profile({ correctionX: 0.5, correctionY: 0.5 }),
      compensable,
    );
    for (const key of Object.keys(DRAWER_TRAY_DEFAULTS)) {
      if (key === "drawerWidth" || key === "drawerDepth") continue;
      expect(result[key as keyof typeof result]).toEqual(
        DRAWER_TRAY_DEFAULTS[key as keyof typeof DRAWER_TRAY_DEFAULTS],
      );
    }
  });

  it("does not change its input and returns a new object", () => {
    const input = { ...DRAWER_TRAY_DEFAULTS };
    const result = compensate(input, profile({ correctionX: 1 }), compensable);
    expect(input.drawerWidth).toBe(300);
    expect(result).not.toBe(input);
  });

  it("is pure: equal input gives equal output every time", () => {
    const printer = profile({ correctionX: 0.35, correctionY: 0.15 });
    const first = compensate(DRAWER_TRAY_DEFAULTS, printer, compensable);
    const second = compensate(DRAWER_TRAY_DEFAULTS, printer, compensable);
    expect(first).toEqual(second);
  });

  it("leaves a named parameter that is not a finite number alone", () => {
    const result = compensate(
      { ...DRAWER_TRAY_DEFAULTS, drawerWidth: Number.NaN },
      profile({ correctionX: 0.5 }),
      compensable,
    );
    expect(Number.isNaN(result.drawerWidth)).toBe(true);
  });

  it("ignores a compensable key the product does not have", () => {
    const result = compensate(
      DRAWER_TRAY_DEFAULTS,
      profile({ correctionX: 0.5 }),
      { x: ["missingKey"] },
    );
    expect(result).toEqual(DRAWER_TRAY_DEFAULTS);
  });
});

describe("compensation display", () => {
  it("states the modeled size, the target, and the correction", () => {
    const printer = profile({ correctionX: 0.5 });
    const target = extentsOf(DRAWER_TRAY_DEFAULTS);
    const modeled = extentsOf(
      compensate(DRAWER_TRAY_DEFAULTS, printer, drawerTray.compensable),
    );
    const notes = compensationNotes(target, modeled, printer);
    expect(notes).toHaveLength(1);
    expect(notes[0].axisLabel).toBe("X");
    expect(notes[0].text).toBe(
      "Modeled 299.5 mm = target 299 mm + 0.5 mm correction",
    );
  });

  it("uses a minus sign for a negative correction", () => {
    const printer = profile({ correctionY: -0.4 });
    const target = extentsOf(DRAWER_TRAY_DEFAULTS);
    const modeled = extentsOf(
      compensate(DRAWER_TRAY_DEFAULTS, printer, drawerTray.compensable),
    );
    const notes = compensationNotes(target, modeled, printer);
    expect(notes[0].text).toBe(
      "Modeled 198.6 mm = target 199 mm − 0.4 mm correction",
    );
  });

  it("shows one line for each corrected axis", () => {
    const printer = profile({ correctionX: 0.5, correctionY: 0.3 });
    const target = extentsOf(DRAWER_TRAY_DEFAULTS);
    const modeled = extentsOf(
      compensate(DRAWER_TRAY_DEFAULTS, printer, drawerTray.compensable),
    );
    expect(compensationNotes(target, modeled, printer).map((note) => note.axis)).toEqual([
      "x",
      "y",
    ]);
  });

  it("shows no line when no correction is set", () => {
    const target = extentsOf(DRAWER_TRAY_DEFAULTS);
    expect(compensationNotes(target, target, profile())).toEqual([]);
    expect(hasCorrection(profile())).toBe(false);
  });
});

describe("calibration proposal", () => {
  it("uses existing plus expected minus measured", () => {
    const proposal = calibrationProposal("x", 0.5, 299.5, 299.4);
    expect(proposal?.proposed).toBe(0.6);
    expect(proposal?.text).toBe(
      "New X correction 0.6 mm = existing 0.5 mm + expected 299.5 mm − measured 299.4 mm",
    );
  });

  it("keeps the correction as it is when the print matches the model", () => {
    expect(calibrationProposal("y", 0.3, 199.3, 199.3)?.proposed).toBe(0.3);
  });

  it("proposes a negative correction for a print that is too large", () => {
    expect(calibrationProposal("x", 0, 299, 299.6)?.proposed).toBe(-0.6);
  });

  it("replaces the correction, so a second apply of the same result is stable", () => {
    // A print that matches the model needs no change. Apply, then apply the
    // same measurement again: the correction stays where it is.
    const first = calibrationProposal("x", 0.5, 299.5, 299.5);
    expect(first?.proposed).toBe(0.5);
    const second = calibrationProposal("x", first!.proposed, 299.5, 299.5);
    expect(second?.proposed).toBe(0.5);
  });

  it("refuses a measurement that is not a positive number", () => {
    expect(calibrationProposal("x", 0, 299, Number.NaN)).toBeNull();
    expect(calibrationProposal("x", 0, 299, 0)).toBeNull();
  });

  it("clamps a proposal that would leave the correction limit", () => {
    expect(calibrationProposal("x", 0, 299, 1)?.proposed).toBe(
      PRINTER_LIMITS.correctionX.max,
    );
  });
});

describe("printer warnings and wall errors", () => {
  const walls = wallLikeKeys(drawerTray.specs).map((key) => ({
    key,
    label: drawerTray.specs[key as keyof typeof drawerTray.specs].label,
    value: DRAWER_TRAY_DEFAULTS[
      key as keyof typeof DRAWER_TRAY_DEFAULTS
    ] as number,
  }));

  it("finds the wall-like parameters of the drawer tray", () => {
    expect(wallLikeKeys(drawerTray.specs).sort()).toEqual([
      "baseThickness",
      "dividerThickness",
      "wallThickness",
    ]);
  });

  it("gives no warning for a part that fits the bed exactly", () => {
    expect(bedWarnings({ x: 220, y: 220, z: 220 }, profile(), true)).toEqual([]);
  });

  it("gives no warning at all while the bed size is a placeholder", () => {
    expect(bedWarnings({ x: 900, y: 900, z: 900 }, profile(), false)).toEqual([]);
  });

  it("warns for a part one millimeter larger than the bed", () => {
    const warnings = bedWarnings({ x: 221, y: 220, z: 220 }, profile(), true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].id).toBe("bed-x");
    expect(warnings[0].text).toBe(
      "The part is 221 mm in X. The bed is 220 mm in X.",
    );
  });

  it("warns on every axis, height included", () => {
    const warnings = bedWarnings({ x: 300, y: 300, z: 300 }, profile(), true);
    expect(warnings.map((warning) => warning.id)).toEqual([
      "bed-x",
      "bed-y",
      "bed-z",
    ]);
  });

  it("gives no bed warning without a size", () => {
    expect(bedWarnings(null, profile(), true)).toEqual([]);
  });

  it("reports a wall under two nozzle widths and names the nozzle", () => {
    const issues = thinWallIssues(
      [{ key: "wallThickness", label: "Outer wall thickness", value: 1.2 }],
      profile({ nozzleDiameter: 0.8 }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].text).toBe(
      "Outer wall thickness is 1.2 mm. A 0.8 mm nozzle needs at least 1.6 mm. A thin wall is weak.",
    );
  });

  it("reports nothing at exactly two nozzle widths", () => {
    expect(
      thinWallIssues(
        [{ key: "wallThickness", label: "Outer wall thickness", value: 0.8 }],
        profile({ nozzleDiameter: 0.4 }),
      ),
    ).toEqual([]);
  });

  it("passes the drawer tray defaults on a 0.4 mm nozzle", () => {
    expect(thinWallIssues(walls, profile())).toEqual([]);
  });
});

describe("corrections that leave a parameter range", () => {
  it("names the axis and the field, not the field limit", () => {
    const messages = correctionRangeMessages(
      ["drawerWidth"],
      drawerTray.compensable,
      profile({ correctionX: 0.5 }),
      () => "Drawer width",
    );
    expect(messages).toEqual([
      "The X correction takes the drawer width past its limit.",
    ]);
  });

  it("says nothing for an axis with no correction", () => {
    expect(
      correctionRangeMessages(
        ["drawerDepth"],
        drawerTray.compensable,
        profile({ correctionX: 0.5 }),
        () => "Drawer depth",
      ),
    ).toEqual([]);
  });

  it("says nothing for a field that is not compensated", () => {
    expect(
      correctionRangeMessages(
        ["wallThickness"],
        drawerTray.compensable,
        profile({ correctionX: 0.5, correctionY: 0.5 }),
        () => "Outer walls",
      ),
    ).toEqual([]);
  });
});

describe("a product with no compensable list", () => {
  // A stub product: it names no compensable parameter, so no correction can
  // reach it.
  const stub = { compensable: undefined };

  it("reads with no correction", () => {
    const active = activeCorrections(
      profile({ correctionX: 0.5, correctionY: -0.3 }),
      stub.compensable,
    );
    expect(active.correctionX).toBe(0);
    expect(active.correctionY).toBe(0);
    expect(active.bedWidth).toBe(220);
  });

  it("treats an empty compensable list as no list", () => {
    expect(
      activeCorrections(profile({ correctionX: 0.5 }), { x: [], y: [] }).correctionX,
    ).toBe(0);
  });

  it("does not double count the correction in a calibration proposal", () => {
    const printer = profile({ correctionX: 0.5 });
    const active = activeCorrections(printer, stub.compensable);
    // The part is 299 mm, uncorrected, and it printed 298.9 mm.
    const proposal = calibrationProposal("x", active.correctionX, 299, 298.9);
    expect(proposal?.proposed).toBe(0.1);
    // The raw profile would have proposed 0.6 mm for the same measurement.
    expect(calibrationProposal("x", printer.correctionX, 299, 298.9)?.proposed).toBe(0.6);
  });

  it("keeps the file-name marker off its files", () => {
    expect(
      correctionFilenameTag(
        activeCorrections(profile({ correctionX: 0.5 }), stub.compensable),
      ),
    ).toBe("");
  });
});

describe("correction file-name marker", () => {
  it("adds nothing when no correction is set", () => {
    expect(correctionFilenameTag(profile())).toBe("");
    expect(withCorrectionTag("part.stl", profile())).toBe("part.stl");
  });

  it("names each corrected axis", () => {
    expect(correctionFilenameTag(profile({ correctionX: 0.5 }))).toBe("cx0p5");
    expect(correctionFilenameTag(profile({ correctionY: -0.2 }))).toBe("cym0p2");
    expect(
      correctionFilenameTag(profile({ correctionX: 0.5, correctionY: 0.25 })),
    ).toBe("cx0p5y0p25");
  });

  it("keeps the extension and separates two corrections", () => {
    expect(withCorrectionTag("a-b-08d29d.stl", profile({ correctionX: 0.5 }))).toBe(
      "a-b-08d29d-cx0p5.stl",
    );
    expect(
      withCorrectionTag("a-b-08d29d.stl", profile({ correctionX: 0.3 })),
    ).not.toBe(withCorrectionTag("a-b-08d29d.stl", profile({ correctionX: 0.5 })));
  });
});

describe("compensated geometry", () => {
  it("moves the outside bounds by exactly the correction", async () => {
    const printer = profile({ correctionX: 0.5, correctionY: -0.3 });
    const target = drawerTray.normalize(DRAWER_TRAY_DEFAULTS);
    const corrected = compensate(target, printer, drawerTray.compensable);

    const plain = await drawerTray.generate(target);
    const compensated = await drawerTray.generate(corrected);

    const width = (model: typeof plain) => model.bounds[1][0] - model.bounds[0][0];
    const depth = (model: typeof plain) => model.bounds[1][1] - model.bounds[0][1];
    const height = (model: typeof plain) => model.bounds[1][2] - model.bounds[0][2];

    expect(width(compensated) - width(plain)).toBeCloseTo(0.5, 5);
    expect(depth(compensated) - depth(plain)).toBeCloseTo(-0.3, 5);
    expect(height(compensated) - height(plain)).toBeCloseTo(0, 6);
  });

  it("changes the compartments by the correction and never by more", () => {
    const printer = profile({ correctionX: 0.6, correctionY: 0.6 });
    const target = drawerTray.normalize(DRAWER_TRAY_DEFAULTS);
    const corrected = compensate(target, printer, drawerTray.compensable);
    const plain = deriveDimensions(target);
    const shifted = deriveDimensions(corrected);

    const widthChange = shifted.compartmentWidth - plain.compartmentWidth;
    const depthChange = shifted.compartmentDepth - plain.compartmentDepth;
    expect(widthChange).toBeCloseTo(0.6 / target.columns, 6);
    expect(depthChange).toBeCloseTo(0.6 / target.rows, 6);
    expect(widthChange).toBeLessThanOrEqual(0.6);
    expect(depthChange).toBeLessThanOrEqual(0.6);
  });

  it("builds the same mesh as the target with a zero correction", async () => {
    const target = drawerTray.normalize(DRAWER_TRAY_DEFAULTS);
    const uncorrected = compensate(target, profile(), drawerTray.compensable);
    expect(uncorrected).toEqual(target);

    const plain = await drawerTray.generate(target);
    const same = await drawerTray.generate(uncorrected);
    expect(same.mesh.triVerts).toEqual(plain.mesh.triVerts);
    expect(same.mesh.vertProperties).toEqual(plain.mesh.vertProperties);
  });
});
