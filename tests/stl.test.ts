import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { drawerTray } from "../lib/products/drawer-tray";
import { inspectBinaryStl, serializeBinaryStl } from "../lib/stl";
import { modelToBufferGeometry } from "../lib/three-geometry";

describe("binary STL export", () => {
  it("serializes the exact preview triangles with matching bounds", async () => {
    const parameters = drawerTray.normalize(drawerTray.defaults);
    const model = await drawerTray.generate(parameters);
    const geometry = modelToBufferGeometry(model);
    const data = serializeBinaryStl(geometry);
    const inspected = inspectBinaryStl(data);
    geometry.computeBoundingBox();

    expect(data.byteLength).toBe(84 + inspected.triangleCount * 50);
    expect(inspected.triangleCount).toBe(
      geometry.getAttribute("position").count / 3,
    );
    expect(inspected.finite).toBe(true);
    expect(inspected.minimumTriangleArea).toBeGreaterThan(1e-8);
    expect(inspected.minimumNormalAlignment).toBeGreaterThan(0.99999);
    expect(inspected.bounds.min.distanceTo(geometry.boundingBox!.min)).toBeLessThan(
      1e-5,
    );
    expect(inspected.bounds.max.distanceTo(geometry.boundingBox!.max)).toBeLessThan(
      1e-5,
    );

    const independentlyParsed = new STLLoader().parse(data);
    independentlyParsed.computeBoundingBox();
    expect(independentlyParsed.getAttribute("position").count).toBe(
      geometry.getAttribute("position").count,
    );
    expect(
      independentlyParsed.boundingBox!.min.distanceTo(geometry.boundingBox!.min),
    ).toBeLessThan(1e-5);
    expect(
      independentlyParsed.boundingBox!.max.distanceTo(geometry.boundingBox!.max),
    ).toBeLessThan(1e-5);
    independentlyParsed.dispose();
    geometry.dispose();
  });

  it("rejects malformed binary STL data", () => {
    expect(() => inspectBinaryStl(new ArrayBuffer(12))).toThrow(/too short/i);
    expect(() => inspectBinaryStl(new ArrayBuffer(84))).toThrow(/no facets/i);
    const malformed = new ArrayBuffer(84);
    new DataView(malformed).setUint32(80, 1, true);
    expect(() => inspectBinaryStl(malformed)).toThrow(/facet count/i);
  });

  it("rejects zero-facet and indexed preview geometries", () => {
    const empty = new THREE.BufferGeometry();
    empty.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    expect(() => serializeBinaryStl(empty)).toThrow(/at least one triangle/i);

    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
    );
    indexed.setIndex([0, 1, 2]);
    expect(() => serializeBinaryStl(indexed)).toThrow(/non-indexed/i);

    empty.dispose();
    indexed.dispose();
  });
});
