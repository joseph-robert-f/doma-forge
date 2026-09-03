import { describe, expect, it } from "vitest";
import {
  activeCorrections,
  printContextOf,
  bedWarnings,
  calibrationProposal,
  compensate,
  compensationNotes,
  correctionFilenameTag,
  correctionRangeMessages,
  diameterCorrection,
  extentsFromBounds,
  hasCorrection,
  normalizePrinterProfile,
  PRINTER_LIMITS,
  PRINTER_PROFILE_DEFAULTS,
  thinWallIssues,
  type PrinterProfileV1,
  validatePrinterProfile,
  wallLikeKeys,
  withCorrectionTag,
} from "../lib/printer-profile";
import {
  DRAWER_TRAY_DEFAULTS,
  deriveDimensions,
  drawerTray,
} from "../lib/products/drawer-tray";
import { plantPot } from "../lib/products/plant-pot";

function profile(overrides: Partial<PrinterProfileV1> = {}): PrinterProfileV1 {
  return { ...PRINTER_PROFILE_DEFAULTS, ...overrides };
}

const extentsOf = (
  parameters: Parameters<typeof drawerTray.boundsContract>[0],
) => extentsFromBounds(drawerTray.boundsContract(parameters));

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
    const normalized = normalizePrinterProfile({
      correctionX: 900,
      bedWidth: -4,
    });
    expect(normalized.correctionX).toBe(PRINTER_LIMITS.correctionX.max);
    expect(normalized.bedWidth).toBe(PRINTER_LIMITS.bedWidth.min);
  });

  it("trims the name and keeps an empty name from replacing the default", () => {
    expect(normalizePrinterProfile({ name: "  Bench one  " }).name).toBe(
      "Bench one",
    );
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
    expect(issues[0].message).toBe(
      "Y correction must be between -25 and 25 mm.",
    );
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
    const notes = compensationNotes(target, modeled);
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
    const notes = compensationNotes(target, modeled);
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
    expect(compensationNotes(target, modeled).map((note) => note.axis)).toEqual(
      ["x", "y"],
    );
  });

  it("shows no line when no correction is set", () => {
    const target = extentsOf(DRAWER_TRAY_DEFAULTS);
    expect(compensationNotes(target, target)).toEqual([]);
    expect(hasCorrection(profile())).toBe(false);
  });
});

describe("calibration proposal", () => {
  it("uses existing plus expected minus measured", () => {
    const proposal = calibrationProposal("x", 0.5, 299.5, 299.4);
    expect(proposal?.proposed).toBe(0.6);
    expect(proposal?.text).toBe(
      "New X correction 0.6 mm = existing 0.5 mm + target 299.5 mm − measured 299.4 mm",
    );
  });

  it("settles on the existing correction once the print measures the target, not twice it (F-5)", () => {
    // The app must pass the target size as `expected`, not the modeled
    // size (target plus the existing correction): the modeled size already
    // holds `existing`, so using it here would count that correction
    // twice. A correctly calibrated printer prints the target once the
    // correction is right, so `measured` equal to `target` is the fixed
    // point the calibration loop should settle at in one step.
    const existing = 0.6;
    const target = 299;
    const measured = target;
    expect(calibrationProposal("x", existing, target, measured)?.proposed).toBe(
      existing,
    );
    // The bug this guards against: passing the modeled size (which already
    // includes `existing`) as `expected` counts the correction twice.
    const modeledIncludingExisting = target + existing;
    expect(
      calibrationProposal("x", existing, modeledIncludingExisting, measured)
        ?.proposed,
    ).toBe(2 * existing);
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

  it("names the existing correction as the mean when existingKind is mean (F-3)", () => {
    const proposal = calibrationProposal("x", 0.3, 147, 147, "mean");
    expect(proposal?.existingKind).toBe("mean");
    expect(proposal?.text).toBe(
      "New X correction 0.3 mm = existing mean correction 0.3 mm + target 147 mm − measured 147 mm",
    );
  });

  it("defaults existingKind to axis, and names it plainly", () => {
    const proposal = calibrationProposal("x", 0.5, 299.5, 299.4);
    expect(proposal?.existingKind).toBe("axis");
    expect(proposal?.text).toContain("= existing 0.5 mm +");
  });

  it("a diameter-only product's proposal is a fixed point with the mean, and drifts with a per-axis existing (F-3)", () => {
    // A machine that shrinks by different amounts on the two axes: 0.4 mm
    // in X, 0.2 mm in Y. The pot compensates only its diameter, so every
    // round the printed part actually moves by the mean of the two profile
    // corrections, diameterCorrection(profile), regardless of which number
    // the caller happens to pass in as `existing`.
    const target = 147;
    const shrink = { x: 0.4, y: 0.2 };
    const mean = (profileNow: PrinterProfileV1) =>
      (profileNow.correctionX + profileNow.correctionY) / 2;

    // Per-axis existing: the caller passes correctionX and correctionY
    // straight through, as an x/y product would. The two corrections walk
    // apart round after round even though the printed part stops moving.
    let axisProfile = profile({ correctionX: 0, correctionY: 0 });
    const axisRounds: Array<[number, number]> = [];
    for (let round = 0; round < 5; round++) {
      const printedMean = mean(axisProfile);
      const proposedX = calibrationProposal(
        "x",
        axisProfile.correctionX,
        target,
        target - shrink.x + printedMean,
      )!.proposed;
      const proposedY = calibrationProposal(
        "y",
        axisProfile.correctionY,
        target,
        target - shrink.y + printedMean,
      )!.proposed;
      axisRounds.push([proposedX, proposedY]);
      axisProfile = profile({ correctionX: proposedX, correctionY: proposedY });
    }
    // Each round after the first proposes a wider spread than 0.4/0.2: the
    // per-axis existing does not settle.
    expect(axisRounds[0]).toEqual([0.4, 0.2]);
    expect(axisRounds[1]).not.toEqual(axisRounds[0]);
    expect(axisRounds[4][0]).toBeGreaterThan(axisRounds[0][0]);
    expect(axisRounds[4][1]).toBeLessThan(axisRounds[0][1]);

    // Mean existing: the caller passes diameterCorrection(profile) for both
    // axes, as the app does for a diameter-only product. The proposal is a
    // fixed point in one step and stays there.
    let meanProfile = profile({ correctionX: 0, correctionY: 0 });
    const meanRounds: Array<[number, number]> = [];
    for (let round = 0; round < 5; round++) {
      const existing = diameterCorrection(meanProfile);
      const printedMean = mean(meanProfile);
      const proposedX = calibrationProposal(
        "x",
        existing,
        target,
        target - shrink.x + printedMean,
        "mean",
      )!.proposed;
      const proposedY = calibrationProposal(
        "y",
        existing,
        target,
        target - shrink.y + printedMean,
        "mean",
      )!.proposed;
      meanRounds.push([proposedX, proposedY]);
      meanProfile = profile({ correctionX: proposedX, correctionY: proposedY });
    }
    expect(meanRounds[0]).toEqual([0.4, 0.2]);
    for (const round of meanRounds) {
      expect(round).toEqual([0.4, 0.2]);
    }
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
    expect(bedWarnings({ x: 220, y: 220, z: 220 }, profile(), true)).toEqual(
      [],
    );
  });

  it("gives no warning at all while the bed size is a placeholder", () => {
    expect(bedWarnings({ x: 900, y: 900, z: 900 }, profile(), false)).toEqual(
      [],
    );
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
      activeCorrections(profile({ correctionX: 0.5 }), { x: [], y: [] })
        .correctionX,
    ).toBe(0);
  });

  it("does not double count the correction in a calibration proposal", () => {
    const printer = profile({ correctionX: 0.5 });
    const active = activeCorrections(printer, stub.compensable);
    // The part is 299 mm, uncorrected, and it printed 298.9 mm.
    const proposal = calibrationProposal("x", active.correctionX, 299, 298.9);
    expect(proposal?.proposed).toBe(0.1);
    // The raw profile would have proposed 0.6 mm for the same measurement.
    expect(
      calibrationProposal("x", printer.correctionX, 299, 298.9)?.proposed,
    ).toBe(0.6);
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
    expect(correctionFilenameTag(profile({ correctionY: -0.2 }))).toBe(
      "cym0p2",
    );
    expect(
      correctionFilenameTag(profile({ correctionX: 0.5, correctionY: 0.25 })),
    ).toBe("cx0p5y0p25");
  });

  it("keeps the extension and separates two corrections", () => {
    expect(
      withCorrectionTag("a-b-08d29d.stl", profile({ correctionX: 0.5 })),
    ).toBe("a-b-08d29d-cx0p5.stl");
    expect(
      withCorrectionTag("a-b-08d29d.stl", profile({ correctionX: 0.3 })),
    ).not.toBe(
      withCorrectionTag("a-b-08d29d.stl", profile({ correctionX: 0.5 })),
    );
  });
});

describe("compensated geometry", () => {
  it("moves the outside bounds by exactly the correction", async () => {
    const printer = profile({ correctionX: 0.5, correctionY: -0.3 });
    const target = drawerTray.normalize(DRAWER_TRAY_DEFAULTS);
    const corrected = compensate(target, printer, drawerTray.compensable);

    const plain = await drawerTray.generate(target);
    const compensated = await drawerTray.generate(corrected);

    const width = (model: typeof plain) =>
      model.bounds[1][0] - model.bounds[0][0];
    const depth = (model: typeof plain) =>
      model.bounds[1][1] - model.bounds[0][1];
    const height = (model: typeof plain) =>
      model.bounds[1][2] - model.bounds[0][2];

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

describe("diameter compensation", () => {
  const profile = (correctionX: number, correctionY: number) =>
    normalizePrinterProfile({ correctionX, correctionY });
  const round = { baseDiameter: 120, potHeight: 130 };
  const compensable = { diameter: ["baseDiameter"] } as const;

  it("takes the mean of the two axis corrections, once", () => {
    expect(diameterCorrection(profile(0.4, 0.2))).toBe(0.3);
    expect(compensate(round, profile(0.4, 0.2), compensable)).toEqual({
      baseDiameter: 120.3,
      potHeight: 130,
    });
  });

  it("takes half of a one-axis correction and nothing from a zero correction", () => {
    expect(compensate(round, profile(0.5, 0), compensable)).toEqual({
      baseDiameter: 120.25,
      potHeight: 130,
    });
    expect(compensate(round, profile(0, 0), compensable)).toEqual(round);
  });

  it("never adds both axis corrections to a diameter", () => {
    const both = { x: ["baseDiameter"], y: ["baseDiameter"] } as const;
    // The two-list form is the mistake D-1511 in 23_REVOLVED_FORMS_NOTES.md
    // describes; the diameter list is the fix. The mean is at most one
    // axis correction, never their sum.
    expect(compensate(round, profile(0.4, 0.4), both).baseDiameter).toBe(120.8);
    expect(compensate(round, profile(0.4, 0.4), compensable).baseDiameter).toBe(
      120.4,
    );
  });

  it("counts a diameter list as an active correction", () => {
    const active = activeCorrections(profile(0.4, 0.2), compensable);
    expect(active.correctionX).toBe(0.4);
    expect(active.correctionY).toBe(0.2);
    const inactive = activeCorrections(profile(0.4, 0.2), { diameter: [] });
    expect(inactive.correctionX).toBe(0);
    expect(inactive.correctionY).toBe(0);
  });

  it("names the mean correction when a diameter leaves its limit", () => {
    const messages = correctionRangeMessages(
      ["baseDiameter"],
      compensable,
      profile(0.4, 0.2),
      () => "Base diameter",
    );
    expect(messages).toEqual([
      "The mean X and Y correction takes the base diameter past its limit.",
    ]);
    expect(
      correctionRangeMessages(
        ["baseDiameter"],
        compensable,
        profile(0, 0),
        () => "Base diameter",
      ),
    ).toEqual([]);
  });
});

describe("diameter compensation in the notes and the file name", () => {
  const profile = (correctionX: number, correctionY: number) =>
    normalizePrinterProfile({ correctionX, correctionY });
  const diameterOnly = { diameter: ["baseDiameter"] } as const;

  it("notes both axes of a round part that took the mean, even with one axis at zero", () => {
    // A pot 120 mm across with a Y-only correction of 0.6 mm grows 0.3 mm
    // on both axes. The note reads the part, not the profile.
    const target = { x: 120, y: 120, z: 130 };
    const modeled = { x: 120.3, y: 120.3, z: 130 };
    const notes = compensationNotes(target, modeled);
    expect(notes.map((note) => note.axisLabel)).toEqual(["X", "Y"]);
    expect(notes[0].text).toBe(
      "Modeled 120.3 mm = target 120 mm + 0.3 mm correction",
    );
  });

  it("marks a diameter-only product with the mean, and nothing when the mean is zero", () => {
    expect(correctionFilenameTag(profile(0.4, 0.2), diameterOnly)).toBe(
      "cd0p3",
    );
    expect(correctionFilenameTag(profile(0.5, -0.5), diameterOnly)).toBe("");
    expect(withCorrectionTag("pot.stl", profile(0.5, -0.5), diameterOnly)).toBe(
      "pot.stl",
    );
  });

  it("marks only the axes that reach a product with axis lists, and every axis without a list", () => {
    expect(correctionFilenameTag(profile(0.5, 0.2), { x: ["width"] })).toBe(
      "cx0p5",
    );
    expect(
      correctionFilenameTag(profile(0.5, 0.2), { x: ["width"], y: ["depth"] }),
    ).toBe("cx0p5y0p2");
    expect(correctionFilenameTag(profile(0.5, 0.2))).toBe("cx0p5y0p2");
  });

  it("tags the real plant pot definition by its own compensable list, not by every nonzero axis (F-1, D-1714)", () => {
    // The plant pot's compensable list names only diameter. A correction
    // that cancels in the mean (+0.5 X, -0.5 Y) must not mark the file as
    // corrected: the mesh it names is byte-identical to the uncorrected
    // one. Passing no third argument (the bug the model download had)
    // marks every nonzero axis instead, which is what the second pair of
    // expectations below guards against regressing back to.
    expect(
      correctionFilenameTag(profile(0.5, -0.5), plantPot.compensable),
    ).toBe("");
    expect(correctionFilenameTag(profile(0.4, 0.2), plantPot.compensable)).toBe(
      "cd0p3",
    );
    expect(correctionFilenameTag(profile(0.5, -0.5))).toBe("cx0p5ym0p5");
    expect(correctionFilenameTag(profile(0.4, 0.2))).toBe("cx0p4y0p2");
  });
});

describe("print context", () => {
  it("holds a null bed until the profile is saved, and the bed afterwards", () => {
    const profile = normalizePrinterProfile({
      bedWidth: 180,
      bedDepth: 200,
      bedHeight: 210,
      nozzleDiameter: 0.6,
    });
    expect(printContextOf(profile, false)).toEqual({
      bed: null,
      nozzleDiameter: 0.6,
    });
    expect(printContextOf(profile, true)).toEqual({
      bed: { x: 180, y: 200, z: 210 },
      nozzleDiameter: 0.6,
    });
  });
});
