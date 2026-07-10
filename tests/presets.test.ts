import { describe, expect, it } from "vitest";
import { PRESETS, loadPreset } from "../lib/presets";
import { validateParameters } from "../lib/parameters";

describe("presets", () => {
  it("provides three useful, valid named presets", () => {
    expect(PRESETS.map((preset) => preset.id)).toEqual([
      "cutlery",
      "desk-supplies",
      "hardware",
    ]);
    for (const preset of PRESETS) {
      expect(validateParameters(preset.parameters).valid).toBe(true);
    }
  });

  it("returns an isolated parameter copy", () => {
    const first = loadPreset("cutlery");
    first.columns = 1;
    expect(loadPreset("cutlery").columns).toBe(4);
  });
});
