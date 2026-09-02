/**
 * Pure scale math for the 3D viewer scene.
 *
 * Every value here is derived from one input: the axis-aligned bounding box
 * of the mesh on screen. The viewer calls `computeViewerScale` on every
 * model change and applies the result to the ground plane, the reference
 * grid, the scene fog, the shadow camera, and the initial camera placement.
 * No function here touches Three.js. That keeps the formula testable
 * without a WebGL context and keeps the viewer free to apply the numbers
 * however its scene graph needs them.
 *
 * The constants below were chosen so that, for the DrawerForge default tray
 * bounding box ([-149.5, -99.5, 0] to [149.5, 99.5, 50]), the derived ground
 * size, fog range, and shadow camera bounds reproduce the values that were
 * hard-coded in the viewer before this module existed. Grid spacing is the
 * one exception: the previous grid used a 20 mm cell, which is not one of
 * the five spacing steps this module snaps to, so the default view now
 * shows a 10 mm grid. See 18_VIEWER_SCALE_NOTES.md for the worked numbers.
 */

/** A bounding box shape independent of any 3D library. */
export interface Box3Like {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * The DrawerForge default tray's bounding box. Two callers use this box.
 * `ModelViewer` scales the scene from it before any model has generated.
 * `computeViewerScale` also falls back to it for a box with a non-finite
 * component (NaN or Infinity), which keeps the scene populated instead of
 * blank while a caller's own math is still wrong.
 */
export const DEFAULT_BOUNDING_BOX: Box3Like = {
  min: [-149.5, -99.5, 0],
  max: [149.5, 99.5, 50],
};

export interface ViewerScale {
  /** Full width and depth of the ground plane, in millimeters. */
  groundSize: number;
  /** Full width and depth of the reference grid, in millimeters. */
  gridSize: number;
  /** Millimeters per grid cell. Always one of GRID_SPACING_STEPS. */
  gridSpacing: number;
  /** Grid divisions that reproduce gridSpacing across gridSize. */
  gridDivisions: number;
  /** Scene fog start distance, in millimeters. */
  fogNear: number;
  /** Scene fog end distance, in millimeters. */
  fogFar: number;
  /** Half-width of the key light's orthographic shadow camera. */
  shadowExtent: number;
  /** Shadow camera near plane. */
  shadowNear: number;
  /** Shadow camera far plane. */
  shadowFar: number;
  /** Distance from the target at which a canonical-angle camera frames the part. */
  cameraDistance: number;
}

/** Grid spacing snaps to one of these five values so the grid stays readable. */
export const GRID_SPACING_STEPS = [1, 5, 10, 50, 100] as const;

const GROUND_RADIUS_MULTIPLIER = 11;
const GROUND_SIZE_MIN = 400;
const GROUND_SIZE_MAX = 6_000;
const GROUND_ROUNDING = 100;

const GRID_RATIO = 0.6;
const GRID_TARGET_CELLS_ACROSS_FOOTPRINT = 15;
const GRID_DIVISIONS_MIN = 2;

const SHADOW_FOOTPRINT_MULTIPLIER = 3.6;
const SHADOW_EXTENT_MIN = 100;
const SHADOW_EXTENT_MAX = 3_000;
const SHADOW_EXTENT_ROUNDING = 50;
const SHADOW_NEAR = 20;
const SHADOW_FAR_EXTENT_MULTIPLIER = 2;
const SHADOW_FAR_HEIGHT_MULTIPLIER = 4;
const SHADOW_FAR_MIN_MARGIN = 100;

const FOG_NEAR_MULTIPLIER = 4.1;
const FOG_FAR_MULTIPLIER = 12.7;
const FOG_ROUNDING = 50;
const FOG_FAR_MIN_MARGIN = 100;

/** Vertical field of view, in degrees, used only to size the initial camera placement. */
const CAMERA_VERTICAL_FOV_DEG = 38;
/** A square viewport is assumed for the initial placement; the live viewer refits on its own aspect once a model is visible. */
const CAMERA_ASSUMED_ASPECT = 1;
const CAMERA_MIN_HALF_FOV_DEG = 8;
const CAMERA_FIT_MARGIN = 1.18;

function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** True only when every component of both corners is a finite number. */
function isFiniteBox(box: Box3Like): boolean {
  return (
    box.min.every((component) => Number.isFinite(component)) &&
    box.max.every((component) => Number.isFinite(component))
  );
}

/** Snaps to the closest step in GRID_SPACING_STEPS, comparing on a log scale so the steps are treated as evenly spaced orders of magnitude. */
function snapGridSpacing(rawSpacing: number): number {
  const target = Math.log(Math.max(rawSpacing, GRID_SPACING_STEPS[0]));
  let closest: number = GRID_SPACING_STEPS[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const step of GRID_SPACING_STEPS) {
    const distance = Math.abs(target - Math.log(step));
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = step;
    }
  }
  return closest;
}

/** Distance at which a camera with the assumed field of view frames a sphere of the given radius, with a small margin. */
function cameraDistanceForRadius(radius: number): number {
  const verticalHalfFov = degToRad(CAMERA_VERTICAL_FOV_DEG) / 2;
  const horizontalHalfFov = Math.atan(
    Math.tan(verticalHalfFov) * CAMERA_ASSUMED_ASPECT,
  );
  const limitingHalfFov = Math.max(
    degToRad(CAMERA_MIN_HALF_FOV_DEG),
    Math.min(verticalHalfFov, horizontalHalfFov),
  );
  return (radius / Math.sin(limitingHalfFov)) * CAMERA_FIT_MARGIN;
}

/**
 * Derives the viewer's scene scale from a mesh bounding box. Every distance
 * in the box and in the result is in millimeters.
 */
export function computeViewerScale(box: Box3Like): ViewerScale {
  // A box with a NaN or Infinity component (a caller's own bug, or a mesh
  // whose bounds have not settled yet) must not reach the math below: it
  // would carry through every formula and leave the scene blank. Fall back
  // to the default tray's box instead.
  const safeBox = isFiniteBox(box) ? box : DEFAULT_BOUNDING_BOX;

  const sizeX = Math.max(0, safeBox.max[0] - safeBox.min[0]);
  const sizeY = Math.max(0, safeBox.max[1] - safeBox.min[1]);
  const sizeZ = Math.max(0, safeBox.max[2] - safeBox.min[2]);

  // A radius of at least 1 mm keeps every formula below well-defined for an
  // empty or point-sized box, which the viewer may briefly see while a
  // product's first mesh is still generating.
  const radius3d = Math.max(1, Math.hypot(sizeX, sizeY, sizeZ) / 2);
  const footprintDiagonal = Math.hypot(sizeX, sizeY);
  const footprintRadius = Math.max(1, footprintDiagonal / 2);
  const footprintLongestSide = Math.max(sizeX, sizeY, 1);

  const groundSize = clamp(
    roundToNearest(radius3d * GROUND_RADIUS_MULTIPLIER, GROUND_ROUNDING),
    GROUND_SIZE_MIN,
    GROUND_SIZE_MAX,
  );

  const rawGridSpacing = footprintLongestSide / GRID_TARGET_CELLS_ACROSS_FOOTPRINT;
  const gridSpacing = snapGridSpacing(rawGridSpacing);
  // gridDivisions comes first, rounded to a whole number of cells. gridSize
  // is then set from gridDivisions * gridSpacing, not the other way round,
  // so the grid drawn on screen always has cells exactly gridSpacing wide.
  // Rounding gridDivisions from an unrelated gridSize would leave the two
  // numbers inconsistent, e.g. a 3420 mm grid at 68 divisions draws 50.3 mm
  // cells, not the 50 mm cells gridSpacing promised.
  const gridDivisions = Math.max(
    GRID_DIVISIONS_MIN,
    Math.round((groundSize * GRID_RATIO) / gridSpacing),
  );
  const gridSize = gridDivisions * gridSpacing;

  // A tall, narrow part (say 40x40x600 mm) has a small footprint but a
  // large 3D radius; using the footprint alone would leave the shadow
  // camera too narrow to cover it. Whichever radius is larger sets the
  // shadow camera's bounds.
  const shadowRadius = Math.max(footprintRadius, radius3d);
  const shadowExtent = clamp(
    roundToNearest(
      shadowRadius * SHADOW_FOOTPRINT_MULTIPLIER,
      SHADOW_EXTENT_ROUNDING,
    ),
    SHADOW_EXTENT_MIN,
    SHADOW_EXTENT_MAX,
  );
  const shadowNear = SHADOW_NEAR;
  const shadowFar = Math.max(
    shadowNear + SHADOW_FAR_MIN_MARGIN,
    shadowExtent * SHADOW_FAR_EXTENT_MULTIPLIER + sizeZ * SHADOW_FAR_HEIGHT_MULTIPLIER,
  );

  const fogNear = Math.max(
    1,
    roundToNearest(radius3d * FOG_NEAR_MULTIPLIER, FOG_ROUNDING),
  );
  const fogFar = Math.max(
    fogNear + FOG_FAR_MIN_MARGIN,
    roundToNearest(radius3d * FOG_FAR_MULTIPLIER, FOG_ROUNDING),
  );

  const cameraDistance = cameraDistanceForRadius(radius3d);

  return {
    groundSize,
    gridSize,
    gridSpacing,
    gridDivisions,
    fogNear,
    fogFar,
    shadowExtent,
    shadowNear,
    shadowFar,
    cameraDistance,
  };
}
