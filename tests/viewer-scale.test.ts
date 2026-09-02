import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOUNDING_BOX,
  GRID_SPACING_STEPS,
  computeViewerScale,
  type Box3Like,
} from "../lib/viewer-scale";

/** A cube of the given side, centered in X and Y with its base at Z = 0. */
function cube(side: number): Box3Like {
  const half = side / 2;
  return { min: [-half, -half, 0], max: [half, half, side] };
}

const DEFAULT_TRAY_BOX: Box3Like = {
  min: [-149.5, -99.5, 0],
  max: [149.5, 99.5, 50],
};

describe("computeViewerScale", () => {
  it("reproduces the viewer's previous fixed scene for the default tray", () => {
    const scale = computeViewerScale(DEFAULT_TRAY_BOX);
    // Ground plane and grid extent match the values that were hard-coded
    // in ModelViewer.tsx before this module existed.
    expect(scale.groundSize).toBe(2_000);
    expect(scale.gridSize).toBe(1_200);
    // Fog and the shadow camera bounds match exactly.
    expect(scale.fogNear).toBe(750);
    expect(scale.fogFar).toBe(2_300);
    expect(scale.shadowExtent).toBe(650);
    expect(scale.shadowNear).toBe(20);
    expect(scale.shadowFar).toBe(1_500);
    // Grid spacing is the one deliberate change: 20 mm is not one of the
    // five allowed snap steps, so the closest one, 10 mm, is used instead.
    expect(scale.gridSpacing).toBe(10);
  });

  it.each([
    { side: 40, expectedGridSpacing: 5 },
    { side: 300, expectedGridSpacing: 10 },
    { side: 600, expectedGridSpacing: 50 },
  ])(
    "snaps grid spacing to a readable step for a $side mm part",
    ({ side, expectedGridSpacing }) => {
      const scale = computeViewerScale(cube(side));
      expect(scale.gridSpacing).toBe(expectedGridSpacing);
      expect(GRID_SPACING_STEPS).toContain(scale.gridSpacing);
    },
  );

  it("grows camera distance and ground size with part size", () => {
    const small = computeViewerScale(cube(40));
    const medium = computeViewerScale(cube(300));
    const large = computeViewerScale(cube(600));

    expect(small.cameraDistance).toBeGreaterThan(0);
    expect(small.cameraDistance).toBeLessThan(medium.cameraDistance);
    expect(medium.cameraDistance).toBeLessThan(large.cameraDistance);

    expect(small.groundSize).toBeLessThan(medium.groundSize);
    expect(medium.groundSize).toBeLessThan(large.groundSize);

    // A 40 mm part is framed at roughly the same relative closeness as a
    // 300 mm part: neither the ground nor the camera distance are fixed,
    // so a small part is not left stranded in the middle of an oversized
    // scene the way it would be with the old fixed constants.
    expect(small.cameraDistance / 40).toBeCloseTo(medium.cameraDistance / 300, 0);
  });

  it("keeps the shadow camera far plane ahead of its near plane at every size", () => {
    for (const side of [40, 300, 600]) {
      const scale = computeViewerScale(cube(side));
      expect(scale.shadowFar).toBeGreaterThan(scale.shadowNear);
      expect(scale.fogFar).toBeGreaterThan(scale.fogNear);
      expect(scale.gridDivisions).toBeGreaterThanOrEqual(2);
    }
  });

  it("clamps ground size and shadow extent for a very small or very large box", () => {
    const tiny = computeViewerScale({ min: [0, 0, 0], max: [0, 0, 0] });
    expect(tiny.groundSize).toBe(400);
    expect(tiny.shadowExtent).toBe(100);
    expect(Number.isFinite(tiny.cameraDistance)).toBe(true);

    const huge = computeViewerScale(cube(5_000));
    expect(huge.groundSize).toBe(6_000);
    expect(huge.shadowExtent).toBe(3_000);
  });

  it.each([40, 300, 600, 2_000])(
    "draws grid cells exactly gridSpacing wide for a %i mm part",
    (side) => {
      const scale = computeViewerScale(cube(side));
      // gridSize must come out as a whole number of gridSpacing-wide cells.
      // Rounding gridDivisions from a gridSize that was not itself a
      // multiple of gridSpacing used to draw cells the wrong width, e.g.
      // 3420 / 68 = 50.3 mm cells instead of the 50 mm gridSpacing promised.
      expect(scale.gridSize / scale.gridDivisions).toBe(scale.gridSpacing);
      expect(Number.isInteger(scale.gridDivisions)).toBe(true);
    },
  );

  it("widens the shadow camera for a tall, narrow part instead of using the footprint alone", () => {
    // 40 x 40 mm footprint, 600 mm tall: the footprint alone would clamp to
    // the 100 mm minimum, far too narrow to cover a part this tall.
    const tallAndNarrow = computeViewerScale({
      min: [-20, -20, 0],
      max: [20, 20, 600],
    });
    const wideAndFlat = computeViewerScale(cube(40));
    expect(tallAndNarrow.shadowExtent).toBeGreaterThan(wideAndFlat.shadowExtent);
    expect(tallAndNarrow.shadowExtent).toBeGreaterThan(1_000);
  });

  it("falls back to the default tray box when a bound is not finite", () => {
    const expected = computeViewerScale(DEFAULT_BOUNDING_BOX);
    const withNaN = computeViewerScale({
      min: [Number.NaN, -20, 0],
      max: [20, 20, 40],
    });
    const withInfinity = computeViewerScale({
      min: [-20, -20, 0],
      max: [20, 20, Number.POSITIVE_INFINITY],
    });
    expect(withNaN).toEqual(expected);
    expect(withInfinity).toEqual(expected);
    for (const scale of [withNaN, withInfinity]) {
      for (const value of Object.values(scale)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });
});
