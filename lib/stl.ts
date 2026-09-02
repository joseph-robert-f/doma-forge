import * as THREE from "three";

const STL_HEADER_BYTES = 80;
const STL_TRIANGLE_BYTES = 50;

function writeVector(view: DataView, offset: number, vector: THREE.Vector3) {
  view.setFloat32(offset, vector.x, true);
  view.setFloat32(offset + 4, vector.y, true);
  view.setFloat32(offset + 8, vector.z, true);
}

export function serializeBinaryStl(geometry: THREE.BufferGeometry): ArrayBuffer {
  if (geometry.index !== null) {
    throw new Error("STL export requires a non-indexed triangle geometry.");
  }
  const position = geometry.getAttribute("position");
  if (!position || position.itemSize !== 3 || position.count % 3 !== 0) {
    throw new Error("STL export requires a non-indexed triangle geometry.");
  }

  const triangleCount = position.count / 3;
  if (triangleCount === 0) {
    throw new Error("STL export requires at least one triangle.");
  }
  const buffer = new ArrayBuffer(
    STL_HEADER_BYTES + 4 + triangleCount * STL_TRIANGLE_BYTES,
  );
  const bytes = new Uint8Array(buffer);
  const header = new TextEncoder().encode("DrawerForge binary STL · intended units: millimeters");
  bytes.set(header.slice(0, STL_HEADER_BYTES), 0);
  const view = new DataView(buffer);
  view.setUint32(STL_HEADER_BYTES, triangleCount, true);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  let offset = STL_HEADER_BYTES + 4;

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const vertex = triangle * 3;
    a.fromBufferAttribute(position, vertex);
    b.fromBufferAttribute(position, vertex + 1);
    c.fromBufferAttribute(position, vertex + 2);
    normal
      .crossVectors(edgeA.copy(b).sub(a), edgeB.copy(c).sub(a))
      .normalize();
    if (![a, b, c, normal].every((value) => value.toArray().every(Number.isFinite))) {
      throw new Error("STL export encountered a non-finite triangle.");
    }
    if (normal.lengthSq() === 0) {
      throw new Error("STL export encountered a zero-area triangle.");
    }

    writeVector(view, offset, normal);
    writeVector(view, offset + 12, a);
    writeVector(view, offset + 24, b);
    writeVector(view, offset + 36, c);
    view.setUint16(offset + 48, 0, true);
    offset += STL_TRIANGLE_BYTES;
  }

  return buffer;
}

export interface BinaryStlInspection {
  triangleCount: number;
  byteLength: number;
  bounds: THREE.Box3;
  finite: boolean;
  minimumTriangleArea: number;
  minimumNormalAlignment: number;
}

export function inspectBinaryStl(buffer: ArrayBuffer): BinaryStlInspection {
  if (buffer.byteLength < STL_HEADER_BYTES + 4) {
    throw new Error("STL data is too short.");
  }
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(STL_HEADER_BYTES, true);
  if (triangleCount === 0) {
    throw new Error("STL data contains no facets.");
  }
  const expectedLength = STL_HEADER_BYTES + 4 + triangleCount * STL_TRIANGLE_BYTES;
  if (buffer.byteLength !== expectedLength) {
    throw new Error("STL facet count does not match its byte length.");
  }

  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const storedNormal = new THREE.Vector3();
  let finite = true;
  let minimumTriangleArea = Number.POSITIVE_INFINITY;
  let minimumNormalAlignment = Number.POSITIVE_INFINITY;
  let offset = STL_HEADER_BYTES + 4;

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    storedNormal.set(
      view.getFloat32(offset, true),
      view.getFloat32(offset + 4, true),
      view.getFloat32(offset + 8, true),
    );
    finite &&= storedNormal.toArray().every(Number.isFinite);
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const vertexOffset = offset + 12 + vertex * 12;
      point.set(
        view.getFloat32(vertexOffset, true),
        view.getFloat32(vertexOffset + 4, true),
        view.getFloat32(vertexOffset + 8, true),
      );
      finite &&= point.toArray().every(Number.isFinite);
      bounds.expandByPoint(point);
      if (vertex === 0) a.copy(point);
      if (vertex === 1) b.copy(point);
      if (vertex === 2) c.copy(point);
    }
    cross.crossVectors(b.clone().sub(a), c.clone().sub(a));
    minimumTriangleArea = Math.min(minimumTriangleArea, cross.length() / 2);
    minimumNormalAlignment = Math.min(
      minimumNormalAlignment,
      storedNormal.lengthSq() > 0
        ? storedNormal.clone().normalize().dot(cross.clone().normalize())
        : -1,
    );
    offset += STL_TRIANGLE_BYTES;
  }

  return {
    triangleCount,
    byteLength: buffer.byteLength,
    bounds,
    finite,
    minimumTriangleArea,
    minimumNormalAlignment,
  };
}
