import * as THREE from "three";
import type { GeneratedOrganizer } from "./organizer-geometry";

const AREA_EPSILON = 1e-10;

export interface MeshAnalysis {
  triangleCount: number;
  bounds: THREE.Box3;
  signedVolume: number;
  minimumTriangleArea: number;
  minimumNormalLength: number;
  finite: boolean;
}

export function organizerToBufferGeometry(
  organizer: GeneratedOrganizer,
): THREE.BufferGeometry {
  const { mesh } = organizer;
  const positions = new Float32Array(mesh.triVerts.length * 3);
  const normals = new Float32Array(mesh.triVerts.length * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const normal = new THREE.Vector3();

  const readVertex = (index: number, target: THREE.Vector3) => {
    const offset = index * mesh.numProp;
    target.set(
      mesh.vertProperties[offset],
      mesh.vertProperties[offset + 1],
      mesh.vertProperties[offset + 2],
    );
  };

  for (let triangle = 0; triangle < mesh.triVerts.length; triangle += 3) {
    readVertex(mesh.triVerts[triangle], a);
    readVertex(mesh.triVerts[triangle + 1], b);
    readVertex(mesh.triVerts[triangle + 2], c);
    normal
      .crossVectors(edgeA.copy(b).sub(a), edgeB.copy(c).sub(a));
    const doubleArea = normal.length();
    if (!Number.isFinite(doubleArea) || doubleArea <= AREA_EPSILON) {
      throw new Error("The geometry kernel returned a degenerate triangle.");
    }
    normal.divideScalar(doubleArea);

    const outputOffset = triangle * 3;
    positions.set(a.toArray(), outputOffset);
    positions.set(b.toArray(), outputOffset + 3);
    positions.set(c.toArray(), outputOffset + 6);
    for (let vertex = 0; vertex < 3; vertex += 1) {
      normals.set(normal.toArray(), outputOffset + vertex * 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function analyzeBufferGeometry(geometry: THREE.BufferGeometry): MeshAnalysis {
  const position = geometry.getAttribute("position");
  const normalAttribute = geometry.getAttribute("normal");
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let signedVolume = 0;
  let minimumTriangleArea = Number.POSITIVE_INFINITY;
  let minimumNormalLength = Number.POSITIVE_INFINITY;
  let finite = true;

  if (!normalAttribute || normalAttribute.count !== position.count) {
    finite = false;
  } else {
    for (let offset = 0; offset < normalAttribute.count; offset += 1) {
      const x = normalAttribute.getX(offset);
      const y = normalAttribute.getY(offset);
      const z = normalAttribute.getZ(offset);
      finite &&= [x, y, z].every(Number.isFinite);
      minimumNormalLength = Math.min(
        minimumNormalLength,
        Math.hypot(x, y, z),
      );
    }
  }

  for (let offset = 0; offset < position.count; offset += 3) {
    a.fromBufferAttribute(position, offset);
    b.fromBufferAttribute(position, offset + 1);
    c.fromBufferAttribute(position, offset + 2);
    finite &&= [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z].every(
      Number.isFinite,
    );
    cross.crossVectors(edgeA.copy(b).sub(a), edgeB.copy(c).sub(a));
    minimumTriangleArea = Math.min(minimumTriangleArea, cross.length() / 2);
    signedVolume += a.dot(cross.crossVectors(b, c)) / 6;
  }

  geometry.computeBoundingBox();
  return {
    triangleCount: position.count / 3,
    bounds: geometry.boundingBox?.clone() ?? new THREE.Box3(),
    signedVolume,
    minimumTriangleArea,
    minimumNormalLength,
    finite,
  };
}
