import { BufferGeometry } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GeneratedModel } from "../lib/kernel/mesh";
import type { BoundsContract } from "../lib/products/types";
import { checkedModelGeometry } from "../lib/three-geometry";

const tetrahedron: GeneratedModel<Record<string, never>> = {
  parameters: {},
  status: "NoError",
  volume: 1 / 6,
  bounds: [[0, 0, 0], [1, 1, 1]],
  mesh: {
    numProp: 3,
    vertProperties: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
    triVerts: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
  },
};
const contract: BoundsContract = { min: [0, 0, 0], max: [1, 1, 1], tolerance: 1e-4 };

afterEach(() => vi.restoreAllMocks());

describe("generated geometry safety and ownership", () => {
  it("hands valid geometry to its caller without disposing it", () => {
    const disposed = vi.spyOn(BufferGeometry.prototype, "dispose");
    const { geometry, analysis } = checkedModelGeometry(tetrahedron, contract, "Invalid mesh");
    try {
      expect(analysis.triangleCount).toBe(4);
      expect(analysis.signedVolume).toBeCloseTo(1 / 6);
      expect(disposed).not.toHaveBeenCalled();
    } finally {
      geometry.dispose();
    }
    expect(disposed).toHaveBeenCalledOnce();
  });

  it("releases geometry rejected by the bounds contract", () => {
    const disposed = vi.spyOn(BufferGeometry.prototype, "dispose");
    expect(() => checkedModelGeometry(
      tetrahedron, { ...contract, max: [2, 1, 1] }, "Invalid mesh",
    )).toThrow("Invalid mesh");
    expect(disposed).toHaveBeenCalledOnce();
  });

  it("releases a mesh with reversed winding", () => {
    const disposed = vi.spyOn(BufferGeometry.prototype, "dispose");
    const reversed = {
      ...tetrahedron,
      mesh: { ...tetrahedron.mesh, triVerts: tetrahedron.mesh.triVerts.slice().reverse() },
    };
    expect(() => checkedModelGeometry(reversed, contract, "Invalid mesh"))
      .toThrow("Invalid mesh");
    expect(disposed).toHaveBeenCalledOnce();
  });
});
