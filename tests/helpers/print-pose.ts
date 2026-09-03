import * as THREE from "three";
import type { KernelMesh } from "../../lib/kernel/mesh";
import type { PrintOrientationHint } from "../../lib/products/types";

/**
 * The overhang check for a print pose. The mesh is turned exactly as the
 * viewer turns it for the "Print pose" toggle: a THREE.Euler in degrees,
 * the same order and the same sign. Then every face that points down more
 * steeply than the limit is an overhang, except a face that lies on the bed,
 * which is every face whose three corners sit at the lowest Z of the turned
 * part. A product with no hint is checked in its modeled pose.
 */

export interface OverhangFace {
  /** The unit normal of the turned face. */
  normal: [number, number, number];
  /** The centroid of the turned face, for the message. */
  centroid: [number, number, number];
  /** Degrees from vertical: 0 is a wall, 90 is a ceiling. */
  degrees: number;
}

const ANGLE_EPSILON_DEGREES = 0.05;

export function turnToPrintPose(
  mesh: KernelMesh,
  hint: PrintOrientationHint | undefined,
): Float32Array {
  const rotation = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(hint?.rotationDegrees.x ?? 0),
      THREE.MathUtils.degToRad(hint?.rotationDegrees.y ?? 0),
      THREE.MathUtils.degToRad(hint?.rotationDegrees.z ?? 0),
    ),
  );
  const vertexCount = mesh.vertProperties.length / mesh.numProp;
  const turned = new Float32Array(vertexCount * 3);
  const point = new THREE.Vector3();
  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * mesh.numProp;
    point
      .set(
        mesh.vertProperties[offset],
        mesh.vertProperties[offset + 1],
        mesh.vertProperties[offset + 2],
      )
      .applyMatrix4(rotation);
    turned[index * 3] = point.x;
    turned[index * 3 + 1] = point.y;
    turned[index * 3 + 2] = point.z;
  }
  return turned;
}

export function overhangFaces(
  mesh: KernelMesh,
  hint: PrintOrientationHint | undefined,
  limitDegrees = 45,
): OverhangFace[] {
  const turned = turnToPrintPose(mesh, hint);
  let lowest = Number.POSITIVE_INFINITY;
  for (let index = 2; index < turned.length; index += 3) {
    lowest = Math.min(lowest, turned[index]);
  }
  const bedEpsilon = 1e-4;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const faces: OverhangFace[] = [];
  for (let triangle = 0; triangle < mesh.triVerts.length; triangle += 3) {
    a.fromArray(turned, mesh.triVerts[triangle] * 3);
    b.fromArray(turned, mesh.triVerts[triangle + 1] * 3);
    c.fromArray(turned, mesh.triVerts[triangle + 2] * 3);
    normal.crossVectors(edgeA.copy(b).sub(a), edgeB.copy(c).sub(a));
    if (normal.lengthSq() < 1e-14) continue;
    normal.normalize();
    if (normal.z >= 0) continue;
    const onBed =
      Math.abs(a.z - lowest) <= bedEpsilon &&
      Math.abs(b.z - lowest) <= bedEpsilon &&
      Math.abs(c.z - lowest) <= bedEpsilon;
    if (onBed) continue;
    const degrees = (Math.asin(Math.min(1, -normal.z)) * 180) / Math.PI;
    if (degrees > limitDegrees + ANGLE_EPSILON_DEGREES) {
      faces.push({
        normal: [normal.x, normal.y, normal.z],
        centroid: [(a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3],
        degrees,
      });
    }
  }
  return faces;
}

/** A short description of the worst faces, for an assertion message. */
export function describeOverhangs(faces: OverhangFace[], limit = 5): string {
  return faces
    .slice()
    .sort((left, right) => right.degrees - left.degrees)
    .slice(0, limit)
    .map(
      (face) =>
        `${face.degrees.toFixed(1)} deg at (${face.centroid.map((value) => value.toFixed(1)).join(", ")})`,
    )
    .join("; ");
}
