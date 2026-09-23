import type { Solid } from "./manifold";

/** A plain, transferable copy of a Manifold triangle mesh. */
export interface KernelMesh {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

export type Bounds = [[number, number, number], [number, number, number]];

/** Result of generating any product: mesh plus the kernel's own measurements. */
export interface GeneratedModel<P> {
  mesh: KernelMesh;
  parameters: P;
  bounds: Bounds;
  volume: number;
  status: string;
}

/**
 * Copies parameters for a generated model, including layout arrays and the
 * nested per-zone surface settings. A returned model never shares editable
 * parameter containers with its caller.
 */
function copyParameters<P>(parameters: P): P {
  if (!parameters || typeof parameters !== "object") return parameters;
  const copy = { ...(parameters as Record<string, unknown>) };
  for (const key of Object.keys(copy)) {
    const value = copy[key];
    if (Array.isArray(value)) copy[key] = [...value];
    if (key === "surfaceTreatments" && value && typeof value === "object") {
      const treatment = value as { enabled: boolean; zones: Record<string, Record<string, unknown>> };
      copy[key] = {
        enabled: treatment.enabled,
        zones: Object.fromEntries(
          Object.entries(treatment.zones).map(([id, setting]) => [id, { ...setting }]),
        ),
      };
    }
  }
  return copy as P;
}

/**
 * The threshold on a triangle's doubled area (the length of its corners'
 * cross product) below which the triangle is dropped as degenerate. It
 * matches the guard `modelToBufferGeometry` applies to the same mesh in
 * `lib/three-geometry.ts`, so nothing the viewer would refuse can leave the
 * kernel: a triangle that survives the drop always clears the viewer's own
 * check too. The smallest nonzero doubled area found over every shipped
 * product's defaults and presets is about 1.3e-4, six orders of magnitude
 * above this threshold, so aligning the two guards does not put any real
 * face at risk of being dropped.
 */
export const DEGENERATE_AREA_EPSILON = 1e-10;

const DEGENERATE_AREA_EPSILON_SQUARED =
  DEGENERATE_AREA_EPSILON * DEGENERATE_AREA_EPSILON;

/**
 * Drops every triangle with no real area, keeping the vertex table as it is.
 *
 * A boolean union of coplanar faces can leave slivers behind: a pair of
 * triangles on the same three corners, wound oppositely, so together they
 * cover zero area. Each carries no usable normal, and the viewer's mesh
 * reader refuses the whole part when it meets one. Dropping the pair also
 * restores the closed-edge count. Each of a sliver pair's three edges is the
 * same undirected edge as one edge of the real triangle beside it; with the
 * pair kept, that undirected edge is traversed four times (twice by the real
 * neighbor, twice more by the two oppositely wound slivers), an even, closed
 * count. Removing the pair brings it back to two, still closed. A lone
 * sliver, not part of an oppositely wound pair, would instead leave three
 * edges at count one, open, and nothing at runtime would notice; the mesh
 * this function receives has not produced one.
 *
 * The corners come from the mesh's own float32 values, read into doubles,
 * so the drop can use a small threshold rather than requiring an exact zero:
 * see DEGENERATE_AREA_EPSILON.
 */
function dropZeroAreaTriangles(
  vertProperties: Float32Array,
  triVerts: Uint32Array,
  numProp: number,
): Uint32Array {
  const kept: number[] = [];
  for (let triangle = 0; triangle < triVerts.length; triangle += 3) {
    const a = triVerts[triangle] * numProp;
    const b = triVerts[triangle + 1] * numProp;
    const c = triVerts[triangle + 2] * numProp;
    const abX = vertProperties[b] - vertProperties[a];
    const abY = vertProperties[b + 1] - vertProperties[a + 1];
    const abZ = vertProperties[b + 2] - vertProperties[a + 2];
    const acX = vertProperties[c] - vertProperties[a];
    const acY = vertProperties[c + 1] - vertProperties[a + 1];
    const acZ = vertProperties[c + 2] - vertProperties[a + 2];
    const crossX = abY * acZ - abZ * acY;
    const crossY = abZ * acX - abX * acZ;
    const crossZ = abX * acY - abY * acX;
    const crossLengthSquared =
      crossX * crossX + crossY * crossY + crossZ * crossZ;
    if (crossLengthSquared <= DEGENERATE_AREA_EPSILON_SQUARED) continue;
    kept.push(
      triVerts[triangle],
      triVerts[triangle + 1],
      triVerts[triangle + 2],
    );
  }
  return kept.length === triVerts.length ? triVerts : Uint32Array.from(kept);
}

/**
 * Validates a finished solid, copies its mesh out of WebAssembly memory, and
 * deletes the solid. Throws when the kernel reports an error or an empty body.
 */
export function finishSolid<P>(
  solid: Solid,
  parameters: P,
  productLabel: string,
): GeneratedModel<P> {
  try {
    const status = solid.status();
    if (status !== "NoError" || solid.isEmpty()) {
      throw new Error(
        `The geometry kernel could not create this ${productLabel} (${status}).`,
      );
    }
    const box = solid.boundingBox();
    const volume = solid.volume();
    const outputMesh = solid.getMesh();
    const vertProperties = Float32Array.from(outputMesh.vertProperties);
    const mesh: KernelMesh = {
      numProp: outputMesh.numProp,
      vertProperties,
      triVerts: dropZeroAreaTriangles(
        vertProperties,
        Uint32Array.from(outputMesh.triVerts),
        outputMesh.numProp,
      ),
    };
    return {
      mesh,
      parameters: copyParameters(parameters),
      bounds: [
        [box.min[0], box.min[1], box.min[2]],
        [box.max[0], box.max[1], box.max[2]],
      ],
      volume,
      status,
    };
  } finally {
    solid.delete();
  }
}
