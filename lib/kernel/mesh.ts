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
 * Copies a parameter object one level deep, and copies every array value
 * inside it. A layout parameter holds an array, so a shallow copy alone
 * would leave the result sharing that array with the caller. A value that is
 * not an object is returned as it is.
 */
function copyParameters<P>(parameters: P): P {
  if (!parameters || typeof parameters !== "object") return parameters;
  const copy = { ...(parameters as Record<string, unknown>) };
  for (const key of Object.keys(copy)) {
    const value = copy[key];
    if (Array.isArray(value)) copy[key] = [...value];
  }
  return copy as P;
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
  const status = solid.status();
  if (status !== "NoError" || solid.isEmpty()) {
    solid.delete();
    throw new Error(
      `The geometry kernel could not create this ${productLabel} (${status}).`,
    );
  }
  const box = solid.boundingBox();
  const volume = solid.volume();
  const outputMesh = solid.getMesh();
  const mesh: KernelMesh = {
    numProp: outputMesh.numProp,
    vertProperties: Float32Array.from(outputMesh.vertProperties),
    triVerts: Uint32Array.from(outputMesh.triVerts),
  };
  solid.delete();
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
}
