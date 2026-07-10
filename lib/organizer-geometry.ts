import ManifoldModule, {
  type CrossSection,
  type ManifoldToplevel,
} from "manifold-3d";
import manifoldWasmUrl from "manifold-3d/manifold.wasm?url";
import {
  deriveDimensions,
  validateParameters,
  type DerivedDimensions,
  type MeshQuality,
  type OrganizerParameters,
} from "./parameters";

export interface OrganizerMesh {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

export interface GeneratedOrganizer {
  mesh: OrganizerMesh;
  parameters: OrganizerParameters;
  derived: DerivedDimensions;
  bounds: [[number, number, number], [number, number, number]];
  volume: number;
  status: string;
}

const BOOLEAN_OVERLAP = 0.2;
let manifoldModulePromise: Promise<ManifoldToplevel> | null = null;

export const QUALITY_SEGMENTS: Record<MeshQuality, number> = {
  draft: 12,
  standard: 24,
  fine: 48,
};

async function getManifoldModule(): Promise<ManifoldToplevel> {
  const isNodeRuntime =
    typeof process !== "undefined" && Boolean(process.versions?.node);
  manifoldModulePromise ??= ManifoldModule(
    isNodeRuntime
      ? undefined
      : { locateFile: () => manifoldWasmUrl },
  )
    .then((kernel) => {
      kernel.setup();
      return kernel;
    })
    .catch((error: unknown) => {
      manifoldModulePromise = null;
      throw error;
    });
  return manifoldModulePromise;
}

function roundedRectangle(
  module: ManifoldToplevel,
  width: number,
  depth: number,
  radius: number,
  segments: number,
): CrossSection {
  const safeRadius = Math.max(
    0,
    Math.min(radius, width / 2 - 0.01, depth / 2 - 0.01),
  );
  if (safeRadius < 0.01) {
    return module.CrossSection.square([width, depth], true);
  }
  const core = module.CrossSection.square(
    [width - safeRadius * 2, depth - safeRadius * 2],
    true,
  );
  const rounded = core.offset(safeRadius, "Round", 2, segments);
  core.delete();
  return rounded;
}

export function getFingerScoopRadius(parameters: OrganizerParameters): number {
  const derived = deriveDimensions(parameters);
  const availableWallHeight = parameters.organizerHeight - parameters.baseThickness;
  return Math.max(
    1.5,
    Math.min(12, derived.outsideWidth * 0.075, availableWallHeight - 2),
  );
}

export async function generateOrganizer(
  parameters: OrganizerParameters,
): Promise<GeneratedOrganizer> {
  const validation = validateParameters(parameters);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }

  const kernel = await getManifoldModule();
  const derived = validation.derived;
  const segments = QUALITY_SEGMENTS[parameters.meshQuality];

  const outerProfile = roundedRectangle(
    kernel,
    derived.outsideWidth,
    derived.outsideDepth,
    parameters.cornerRadius,
    segments,
  );
  const outer = outerProfile.extrude(parameters.organizerHeight);
  outerProfile.delete();

  const innerWidth = derived.outsideWidth - parameters.wallThickness * 2;
  const innerDepth = derived.outsideDepth - parameters.wallThickness * 2;
  const innerRadius = Math.max(
    0,
    parameters.cornerRadius - parameters.wallThickness,
  );
  const cavityHeight =
    parameters.organizerHeight - parameters.baseThickness + BOOLEAN_OVERLAP;
  const innerProfile = roundedRectangle(
    kernel,
    innerWidth,
    innerDepth,
    innerRadius,
    segments,
  );
  const cavityAtOrigin = innerProfile.extrude(cavityHeight);
  innerProfile.delete();
  const cavity = cavityAtOrigin.translate([0, 0, parameters.baseThickness]);
  cavityAtOrigin.delete();

  const shell = outer.subtract(cavity);
  cavity.delete();
  const unionInputs: InstanceType<ManifoldToplevel["Manifold"]>[] = [shell];
  const dividerHeight =
    parameters.organizerHeight - parameters.baseThickness + BOOLEAN_OVERLAP * 2;
  const dividerCenterZ =
    parameters.baseThickness +
    (parameters.organizerHeight - parameters.baseThickness) / 2;

  const addClippedDivider = (
    size: [number, number, number],
    center: [number, number, number],
  ) => {
    const dividerAtOrigin = kernel.Manifold.cube(size, true);
    const positionedDivider = dividerAtOrigin.translate(center);
    dividerAtOrigin.delete();
    const clippedDivider = positionedDivider.intersect(outer);
    positionedDivider.delete();
    unionInputs.push(clippedDivider);
  };

  for (let column = 1; column < parameters.columns; column += 1) {
    const centerX =
      -derived.outsideWidth / 2 +
      parameters.wallThickness +
      column * (derived.compartmentWidth + parameters.dividerThickness) -
      parameters.dividerThickness / 2;
    addClippedDivider(
      [
        parameters.dividerThickness,
        derived.outsideDepth + BOOLEAN_OVERLAP * 2,
        dividerHeight,
      ],
      [centerX, 0, dividerCenterZ],
    );
  }

  for (let row = 1; row < parameters.rows; row += 1) {
    const centerY =
      -derived.outsideDepth / 2 +
      parameters.wallThickness +
      row * (derived.compartmentDepth + parameters.dividerThickness) -
      parameters.dividerThickness / 2;
    addClippedDivider(
      [
        derived.outsideWidth + BOOLEAN_OVERLAP * 2,
        parameters.dividerThickness,
        dividerHeight,
      ],
      [0, centerY, dividerCenterZ],
    );
  }

  let solid: InstanceType<ManifoldToplevel["Manifold"]>;
  if (unionInputs.length === 1) {
    solid = shell;
  } else {
    solid = kernel.Manifold.union(unionInputs);
    for (const input of unionInputs) input.delete();
  }
  outer.delete();

  if (parameters.fingerScoop) {
    const scoopRadius = getFingerScoopRadius(parameters);
    const cutterAtOrigin = kernel.Manifold.cylinder(
      parameters.wallThickness + BOOLEAN_OVERLAP * 4,
      scoopRadius,
      scoopRadius,
      segments,
      true,
    );
    const rotatedCutter = cutterAtOrigin.rotate([90, 0, 0]);
    cutterAtOrigin.delete();
    const positionedCutter = rotatedCutter.translate([
      0,
      -derived.outsideDepth / 2 + parameters.wallThickness / 2,
      parameters.organizerHeight,
    ]);
    rotatedCutter.delete();
    const scooped = solid.subtract(positionedCutter);
    solid.delete();
    positionedCutter.delete();
    solid = scooped;
  }

  const status = solid.status();
  if (status !== "NoError" || solid.isEmpty()) {
    solid.delete();
    throw new Error(`The geometry kernel could not create this organizer (${status}).`);
  }

  const box = solid.boundingBox();
  const volume = solid.volume();
  const outputMesh = solid.getMesh();
  const mesh: OrganizerMesh = {
    numProp: outputMesh.numProp,
    vertProperties: Float32Array.from(outputMesh.vertProperties),
    triVerts: Uint32Array.from(outputMesh.triVerts),
  };
  solid.delete();

  return {
    mesh,
    parameters: { ...parameters },
    derived,
    bounds: [
      [box.min[0], box.min[1], box.min[2]],
      [box.max[0], box.max[1], box.max[2]],
    ],
    volume,
    status,
  };
}
