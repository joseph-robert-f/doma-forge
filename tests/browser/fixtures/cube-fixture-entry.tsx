/**
 * Standalone entry for the viewer-scale screenshot fixture. It mounts the
 * real ModelViewer component with a plain 40 mm cube, the same way
 * ProductApp would for a small future product, so the S03 screenshot
 * script can compare the viewer's scene scale at two very different part
 * sizes without waiting on a real small product to exist. Built by
 * capture-screenshots.mjs with the project's own Vite; not part of the app.
 */
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { ModelViewer } from "../../../app/components/ModelViewer";

const CUBE_SIDE = 40;

function buildCubeGeometry(side: number): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(side, side, side);
  // Centered in X and Y, base at Z = 0, matching the product bounds
  // convention (see boundsContract in lib/products/types.ts).
  geometry.translate(0, 0, side / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const root = document.getElementById("root");
if (!root) throw new Error("Fixture is missing its #root element.");

createRoot(root).render(
  <ModelViewer
    geometry={buildCubeGeometry(CUBE_SIDE)}
    modelKey={`fixture-cube-${CUBE_SIDE}`}
    status="ready"
    statusDetail={`${CUBE_SIDE} × ${CUBE_SIDE} × ${CUBE_SIDE} mm`}
  />,
);
