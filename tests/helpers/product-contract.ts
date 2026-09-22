import { Buffer } from "node:buffer";
import type { BufferGeometry } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { expect } from "vitest";
import type { AnyParameters, AnyProduct, BoundsContract } from "../../lib/products/types";
import { inspectBinaryStl, serializeBinaryStl } from "../../lib/stl";
import { analyzeBufferGeometry, modelToBufferGeometry } from "../../lib/three-geometry";
import { closedEdgeCounts, connectedComponentCount } from "./mesh-checks";

/** Check both sides: merely fitting inside the box would accept missing geometry. */
function assertBounds(
  min: readonly number[],
  max: readonly number[],
  contract: BoundsContract,
  context: string,
) {
  expect(Number.isFinite(contract.tolerance), context).toBe(true);
  expect(contract.tolerance, context).toBeGreaterThanOrEqual(0);
  for (let axis = 0; axis < 3; axis += 1) {
    expect(Number.isFinite(min[axis]), `${context}: min axis ${axis}`).toBe(true);
    expect(Number.isFinite(max[axis]), `${context}: max axis ${axis}`).toBe(true);
    expect(Math.abs(min[axis] - contract.min[axis]), `${context}: min axis ${axis}`)
      .toBeLessThanOrEqual(contract.tolerance);
    expect(Math.abs(max[axis] - contract.max[axis]), `${context}: max axis ${axis}`)
      .toBeLessThanOrEqual(contract.tolerance);
  }
}

/** Reusable by the product goldens as well as the cross-product boundary suite. */
export function assertBinaryStlRoundTrip(geometry: BufferGeometry, context: string) {
  const data = serializeBinaryStl(geometry);
  const inspected = inspectBinaryStl(data);
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  expect(data.byteLength, context).toBe(84 + (position.count / 3) * 50);
  expect(inspected.triangleCount, context).toBe(position.count / 3);
  expect(inspected.finite, context).toBe(true);
  expect(inspected.minimumNormalAlignment, context).toBeGreaterThan(0.99999);
  expect(inspected.bounds.min.distanceTo(geometry.boundingBox!.min), context).toBeLessThan(1e-5);
  expect(inspected.bounds.max.distanceTo(geometry.boundingBox!.max), context).toBeLessThan(1e-5);
  const parsed = new STLLoader().parse(data);
  try {
    const actual = parsed.getAttribute("position");
    expect(actual.count, context).toBe(position.count);
    // Binary STL and the preview both use float32. Compare every coordinate,
    // including triangle order, without allocating a large JS number array.
    const bytes = (array: typeof position.array) =>
      Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    expect(bytes(actual.array).equals(bytes(position.array)), `${context}: STL positions`).toBe(true);
  } finally {
    parsed.dispose();
  }
}

export async function assertProductContract(
  product: AnyProduct,
  parameters: AnyParameters,
  fixture: string,
  expectedComponents: number,
) {
  const context = `${product.id} / ${fixture}\nparameters=${JSON.stringify(parameters)}`;
  try {
    expect(product.normalize(parameters), `${context}: normalization is stable`).toEqual(parameters);
    const validation = product.validate(parameters);
    expect(validation.issues, `${context}: expected a valid fixture`).toEqual([]);
    expect(validation.valid, context).toBe(true);
    const model = await product.generate(parameters);
    expect(model.status, context).toBe("NoError");
    expect(Number.isFinite(model.volume), context).toBe(true);
    expect(model.volume, context).toBeGreaterThan(0);
    expect(model.parameters, context).toEqual(parameters);
    const contract = product.boundsContract(parameters);
    assertBounds(model.bounds[0], model.bounds[1], contract, `${context}: kernel bounds`);
    const geometry = modelToBufferGeometry(model);
    try {
      const analysis = analyzeBufferGeometry(geometry);
      expect(analysis.finite, context).toBe(true);
      expect(analysis.triangleCount, context).toBeGreaterThan(0);
      expect(analysis.minimumTriangleArea, context).toBeGreaterThan(1e-8);
      expect(analysis.minimumNormalLength, context).toBeCloseTo(1, 5);
      expect(analysis.signedVolume, context).toBeGreaterThan(0);
      expect(Math.abs(analysis.signedVolume - model.volume) / model.volume, `${context}: volume`)
        .toBeLessThan(0.001);
      assertBounds(analysis.bounds.min.toArray(), analysis.bounds.max.toArray(), contract,
        `${context}: preview bounds`);
      expect(connectedComponentCount(model.mesh.triVerts), `${context}: connected components`)
        .toBe(expectedComponents);
      const edges = closedEdgeCounts(geometry);
      expect(edges.length, context).toBeGreaterThan(0);
      const badEdges = edges.filter((edge) => edge.count !== 2 || edge.balance !== 0);
      expect(badEdges.length,
        `${context}: ${badEdges.length} non-manifold edges; first 8=${JSON.stringify(badEdges.slice(0, 8))}`)
        .toBe(0);
      assertBinaryStlRoundTrip(geometry, context);
    } finally {
      geometry.dispose();
    }
  } catch (cause) {
    // Generation and conversion can throw before an assertion gets a message.
    throw new Error(`${context}\n${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}
