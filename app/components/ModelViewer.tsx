"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PrintOrientationHint } from "../../lib/products/types";
import {
  DEFAULT_BOUNDING_BOX,
  computeViewerScale,
  type ViewerScale,
} from "../../lib/viewer-scale";

export type ViewerStatus =
  | "loading"
  | "updating"
  | "ready"
  | "paused"
  | "error";

export interface ModelViewerProps {
  geometry: THREE.BufferGeometry | null;
  modelKey: string;
  status: ViewerStatus;
  statusDetail?: string;
  /** The print pose hint from the current product, if it sets one. */
  printOrientation?: PrintOrientationHint;
}

const CANONICAL_VIEW = new THREE.Vector3(1.15, -1.35, 0.95).normalize();

const STATUS_LABELS: Record<ViewerStatus, string> = {
  loading: "Loading",
  updating: "Updating",
  ready: "Ready",
  paused: "Paused",
  error: "Error",
};

const viewerStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  minHeight: 320,
  overflow: "hidden",
  border: "1px solid rgba(255, 191, 89, 0.22)",
  borderRadius: 22,
  background:
    "radial-gradient(circle at 58% 36%, #25231f 0%, #15171b 48%, #0b0d11 100%)",
  boxShadow:
    "inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 22px 60px rgba(19, 12, 4, 0.24)",
  color: "#fff7e9",
  isolation: "isolate",
};

const canvasHostStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
};

const toolbarStyle: CSSProperties = {
  position: "absolute",
  zIndex: 2,
  top: 14,
  right: 14,
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: 8,
  maxWidth: "calc(100% - 28px)",
};

const buttonStyle: CSSProperties = {
  minHeight: 38,
  padding: "8px 12px",
  border: "1px solid rgba(255, 216, 159, 0.26)",
  borderRadius: 11,
  background: "rgba(19, 18, 17, 0.82)",
  boxShadow: "0 8px 22px rgba(0, 0, 0, 0.2)",
  color: "#fff5e5",
  font: "inherit",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.01em",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
};

const statusStyle: CSSProperties = {
  position: "absolute",
  zIndex: 2,
  left: 14,
  bottom: 54,
  display: "flex",
  alignItems: "center",
  gap: 9,
  maxWidth: "calc(100% - 28px)",
  minHeight: 36,
  padding: "7px 11px",
  border: "1px solid rgba(255, 216, 159, 0.18)",
  borderRadius: 999,
  background: "rgba(15, 15, 16, 0.78)",
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
  color: "#f8ead6",
  fontSize: 12,
  lineHeight: 1.35,
  backdropFilter: "blur(10px)",
  pointerEvents: "none",
};

const activeButtonStyle: CSSProperties = {
  background: "rgba(246, 173, 60, 0.32)",
  borderColor: "rgba(246, 173, 60, 0.55)",
};

const printNoteStyle: CSSProperties = {
  position: "absolute",
  zIndex: 2,
  top: 58,
  right: 14,
  maxWidth: "calc(100% - 28px)",
  textAlign: "right",
  color: "rgba(255, 240, 218, 0.72)",
  fontSize: 11,
  lineHeight: 1.35,
  pointerEvents: "none",
};

const hintStyle: CSSProperties = {
  position: "absolute",
  zIndex: 1,
  right: 16,
  bottom: 18,
  maxWidth: "50%",
  color: "rgba(255, 240, 218, 0.58)",
  fontSize: 11,
  letterSpacing: "0.01em",
  textAlign: "right",
  pointerEvents: "none",
};

const rendererErrorStyle: CSSProperties = {
  position: "absolute",
  zIndex: 1,
  inset: 0,
  display: "none",
  placeItems: "center",
  padding: 32,
  color: "#f4d8b3",
  fontSize: 14,
  textAlign: "center",
};

function disposeScene(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of objectMaterials) materials.add(material);
    }

    if (
      (object instanceof THREE.DirectionalLight ||
        object instanceof THREE.PointLight ||
        object instanceof THREE.SpotLight) &&
      object.shadow.map
    ) {
      object.shadow.map.dispose();
    }
  });

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

export function ModelViewer({
  geometry,
  modelKey,
  status,
  statusDetail,
  printOrientation,
}: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const rendererErrorRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelMeshRef = useRef<THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  > | null>(null);
  const groundRef = useRef<THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshStandardMaterial
  > | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [printPoseActive, setPrintPoseActive] = useState(false);
  const [rendererErrorMessage, setRendererErrorMessage] = useState<string | null>(null);

  const frameModel = useCallback((resetDirection: boolean) => {
    const mesh = modelMeshRef.current;
    const camera = cameraRef.current;
    if (!mesh || !mesh.visible || !camera) return;

    mesh.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(mesh);
    if (bounds.isEmpty()) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 1);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const limitingHalfFov = Math.max(
      THREE.MathUtils.degToRad(8),
      Math.min(verticalFov, horizontalFov) / 2,
    );
    const distance = (radius / Math.sin(limitingHalfFov)) * 1.18;
    const controls = controlsRef.current;
    const currentTarget = controls?.target ?? center;
    const direction = resetDirection
      ? CANONICAL_VIEW.clone()
      : camera.position.clone().sub(currentTarget).normalize();

    if (!Number.isFinite(direction.lengthSq()) || direction.lengthSq() < 0.5) {
      direction.copy(CANONICAL_VIEW);
    }

    camera.position.copy(center).addScaledVector(direction, distance);
    camera.near = Math.max(0.1, distance - radius * 2.2);
    camera.far = Math.max(2_000, distance + radius * 18);
    camera.updateProjectionMatrix();
    camera.lookAt(center);

    if (controls) {
      controls.target.copy(center);
      controls.minDistance = Math.max(2, radius * 0.12);
      controls.maxDistance = Math.max(2_500, radius * 24);
      controls.update();
    }

    rendererRef.current?.render(sceneRef.current!, camera);
  }, []);

  /** Applies a computed viewer scale to the ground, grid, fog, and shadow camera. */
  const applyViewerScale = useCallback((scale: ViewerScale) => {
    const scene = sceneRef.current;
    if (!scene) return;

    const ground = groundRef.current;
    if (ground) {
      ground.geometry.dispose();
      ground.geometry = new THREE.PlaneGeometry(scale.groundSize, scale.groundSize);
    }

    const previousGrid = gridRef.current;
    if (previousGrid) {
      scene.remove(previousGrid);
      previousGrid.geometry.dispose();
      const previousMaterials = Array.isArray(previousGrid.material)
        ? previousGrid.material
        : [previousGrid.material];
      for (const material of previousMaterials) material.dispose();
    }
    const grid = new THREE.GridHelper(
      scale.gridSize,
      scale.gridDivisions,
      0x765128,
      0x34312c,
    );
    grid.name = "millimeter-reference-grid";
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.06;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.55;
      material.depthWrite = false;
    }
    scene.add(grid);
    gridRef.current = grid;

    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = scale.fogNear;
      scene.fog.far = scale.fogFar;
    }

    const keyLight = keyLightRef.current;
    if (keyLight) {
      keyLight.shadow.camera.left = -scale.shadowExtent;
      keyLight.shadow.camera.right = scale.shadowExtent;
      keyLight.shadow.camera.top = scale.shadowExtent;
      keyLight.shadow.camera.bottom = -scale.shadowExtent;
      keyLight.shadow.camera.near = scale.shadowNear;
      keyLight.shadow.camera.far = scale.shadowFar;
      keyLight.shadow.camera.updateProjectionMatrix();
      // A new left/right/top/bottom/near/far only changes the shadow
      // camera's projection. The depth-target texture (shadow.map) stays
      // valid; it does not need to be freed and rebuilt on every model
      // change.
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvasHost = canvasHostRef.current;
    if (!container || !canvasHost) return;

    if (rendererErrorRef.current) {
      rendererErrorRef.current.hidden = true;
      rendererErrorRef.current.style.display = "none";
      rendererErrorRef.current.textContent = "";
    }

    // Before any model has generated, the scene scales as if the default
    // tray were on the ground. This reproduces the viewer's previous fixed
    // look; the geometry effect below rescales the scene for the actual
    // part on every model change.
    const initialScale = computeViewerScale(DEFAULT_BOUNDING_BOX);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101216);
    scene.fog = new THREE.Fog(0x101216, initialScale.fogNear, initialScale.fogFar);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5_000);
    camera.up.set(0, 0, 1);
    camera.position
      .copy(CANONICAL_VIEW)
      .multiplyScalar(initialScale.cameraDistance);
    cameraRef.current = camera;

    const modelMaterial = new THREE.MeshStandardMaterial({
      color: 0xe39a32,
      emissive: 0x291304,
      emissiveIntensity: 0.16,
      metalness: 0.08,
      roughness: 0.56,
    });
    const modelMesh = new THREE.Mesh(new THREE.BufferGeometry(), modelMaterial);
    modelMesh.name = "product-model";
    modelMesh.castShadow = true;
    modelMesh.receiveShadow = true;
    modelMesh.visible = false;
    scene.add(modelMesh);
    modelMeshRef.current = modelMesh;

    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x17191c,
      metalness: 0.04,
      roughness: 0.94,
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(initialScale.groundSize, initialScale.groundSize),
      groundMaterial,
    );
    ground.name = "workshop-ground";
    ground.position.z = -0.12;
    ground.receiveShadow = true;
    scene.add(ground);
    groundRef.current = ground;

    const grid = new THREE.GridHelper(
      initialScale.gridSize,
      initialScale.gridDivisions,
      0x765128,
      0x34312c,
    );
    grid.name = "millimeter-reference-grid";
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.06;
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = 0.55;
      material.depthWrite = false;
    }
    scene.add(grid);
    gridRef.current = grid;

    const hemisphere = new THREE.HemisphereLight(0xffe4bb, 0x111827, 1.45);
    hemisphere.position.set(-0.2, -0.4, 1);
    scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffd29a, 3.2);
    keyLight.position.set(-260, -330, 520);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1_024, 1_024);
    keyLight.shadow.camera.left = -initialScale.shadowExtent;
    keyLight.shadow.camera.right = initialScale.shadowExtent;
    keyLight.shadow.camera.top = initialScale.shadowExtent;
    keyLight.shadow.camera.bottom = -initialScale.shadowExtent;
    keyLight.shadow.camera.near = initialScale.shadowNear;
    keyLight.shadow.camera.far = initialScale.shadowFar;
    keyLight.shadow.bias = -0.00015;
    keyLight.shadow.normalBias = 0.025;
    keyLight.shadow.camera.updateProjectionMatrix();
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    const fillLight = new THREE.DirectionalLight(0x9db9d8, 1.3);
    fillLight.position.set(340, 180, 260);
    scene.add(fillLight);

    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let removeFallbackResize: (() => void) | null = null;

    const reportRendererError = (message: string) => {
      setRendererErrorMessage(message);
      if (!rendererErrorRef.current) return;
      rendererErrorRef.current.textContent = message;
      rendererErrorRef.current.hidden = false;
      rendererErrorRef.current.style.display = "grid";
    };

    const hasWebGL =
      typeof window.WebGLRenderingContext !== "undefined" ||
      typeof window.WebGL2RenderingContext !== "undefined";

    if (!hasWebGL) {
      reportRendererError(
        "This browser does not provide WebGL for the 3D preview. You can still edit the model and download the STL.",
      );
    } else {
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.08;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        renderer.domElement.style.display = "block";
        renderer.domElement.style.touchAction = "none";
        renderer.domElement.setAttribute("aria-hidden", "true");
        canvasHost.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.075;
        controls.enablePan = true;
        controls.enableRotate = true;
        controls.enableZoom = true;
        controls.screenSpacePanning = true;
        controls.minDistance = 8;
        controls.maxDistance = 4_000;
        controls.target.set(0, 0, 35);
        controls.update();
        controlsRef.current = controls;

        const resize = () => {
          if (!renderer) return;
          const width = Math.max(1, canvasHost.clientWidth);
          const height = Math.max(1, canvasHost.clientHeight);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          frameModel(false);
        };

        resize();
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(resize);
          resizeObserver.observe(canvasHost);
        } else {
          window.addEventListener("resize", resize);
          removeFallbackResize = () => window.removeEventListener("resize", resize);
        }

        let isViewerVisible = true;

        const stopRenderLoop = () => {
          if (animationFrameRef.current !== null) {
            window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
        };
        const renderFrame = () => {
          animationFrameRef.current = null;
          if (!isViewerVisible) return;
          controls?.update();
          renderer?.render(scene, camera);
          animationFrameRef.current = window.requestAnimationFrame(renderFrame);
        };
        const startRenderLoop = () => {
          if (isViewerVisible && animationFrameRef.current === null) {
            animationFrameRef.current = window.requestAnimationFrame(renderFrame);
          }
        };

        if (typeof IntersectionObserver !== "undefined") {
          intersectionObserver = new IntersectionObserver(([entry]) => {
            isViewerVisible = entry?.isIntersecting ?? true;
            if (isViewerVisible) startRenderLoop();
            else stopRenderLoop();
          });
          intersectionObserver.observe(container);
        }
        startRenderLoop();
      } catch {
        controls?.dispose();
        controlsRef.current = null;
        controls = null;
        renderer?.dispose();
        renderer?.domElement.remove();
        renderer = null;
        rendererRef.current = null;
        reportRendererError(
          "The 3D preview could not start in this browser. You can still edit the model and download the STL.",
        );
      }
    }

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      removeFallbackResize?.();
      controls?.dispose();
      disposeScene(scene);
      renderer?.renderLists.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer?.domElement.remove();

      if (sceneRef.current === scene) sceneRef.current = null;
      if (cameraRef.current === camera) cameraRef.current = null;
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (controlsRef.current === controls) controlsRef.current = null;
      if (modelMeshRef.current === modelMesh) modelMeshRef.current = null;
      // The ground and grid may have been replaced by applyViewerScale since
      // mount, and the key light never is; disposeScene above already freed
      // whatever is currently in the scene, so these just drop the refs.
      groundRef.current = null;
      gridRef.current = null;
      if (keyLightRef.current === keyLight) keyLightRef.current = null;
    };
  }, [frameModel]);

  useEffect(() => {
    const modelMesh = modelMeshRef.current;
    if (!modelMesh) {
      geometry?.dispose();
      return;
    }

    if (!geometry) {
      if (modelMesh.visible) {
        modelMesh.geometry.dispose();
        modelMesh.geometry = new THREE.BufferGeometry();
      }
      modelMesh.visible = false;
      return;
    }

    if (modelMesh.geometry !== geometry) {
      modelMesh.geometry.dispose();
    }

    modelMesh.geometry = geometry;
    modelMesh.visible = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const box = geometry.boundingBox;
    if (box && !box.isEmpty()) {
      applyViewerScale(
        computeViewerScale({
          min: [box.min.x, box.min.y, box.min.z],
          max: [box.max.x, box.max.y, box.max.z],
        }),
      );
    }

    frameModel(false);
  }, [applyViewerScale, frameModel, geometry, modelKey]);

  // A product with no print-orientation hint never leaves the toggle
  // showing as pressed; a product that has one owns the toggle state.
  const printPoseOn = printPoseActive && Boolean(printOrientation);

  // Shows the part in its print pose when the toggle is on, and back in its
  // modeled pose when it is off. The bounding box the toggle rotates is the
  // one just used above, so the ground and grid do not resize again here.
  useEffect(() => {
    const modelMesh = modelMeshRef.current;
    if (!modelMesh) return;

    if (printPoseOn && printOrientation) {
      modelMesh.rotation.set(
        THREE.MathUtils.degToRad(printOrientation.rotationDegrees.x),
        THREE.MathUtils.degToRad(printOrientation.rotationDegrees.y),
        THREE.MathUtils.degToRad(printOrientation.rotationDegrees.z),
      );
      // A rotation turns about the mesh's local origin. The part's lowest
      // point can end up below Z = 0, which is below the ground. Reset the
      // seat first, measure the rotated part's own bounding box, and lift
      // it by exactly enough to put that lowest point back at Z = 0.
      modelMesh.position.z = 0;
      modelMesh.updateMatrixWorld(true);
      const rotatedBounds = new THREE.Box3().setFromObject(modelMesh);
      modelMesh.position.z = -rotatedBounds.min.z;
    } else {
      modelMesh.rotation.set(0, 0, 0);
      modelMesh.position.z = 0;
    }
    modelMesh.updateMatrixWorld(true);
    frameModel(false);
  }, [frameModel, printOrientation, printPoseOn, modelKey]);

  const fitModel = useCallback(() => frameModel(false), [frameModel]);
  const resetView = useCallback(() => frameModel(true), [frameModel]);
  const effectiveStatus: ViewerStatus = rendererErrorMessage ? "error" : status;
  const effectiveStatusDetail = rendererErrorMessage
    ? "3D preview unavailable"
    : statusDetail;
  const statusLabel = STATUS_LABELS[effectiveStatus];
  const isBusy =
    effectiveStatus === "loading" || effectiveStatus === "updating";
  const controlsDisabled = !geometry || Boolean(rendererErrorMessage);

  return (
    <div
      ref={containerRef}
      style={viewerStyle}
      role="region"
      aria-label="Interactive 3D model preview"
      aria-describedby="model-viewer-help preview-status"
      aria-busy={isBusy}
      data-testid="model-viewer"
      data-model-key={modelKey}
    >
      <div ref={canvasHostRef} style={canvasHostStyle} aria-hidden="true" />

      <div role="toolbar" aria-label="3D preview view controls" style={toolbarStyle}>
        <button
          type="button"
          style={{
            ...buttonStyle,
            opacity: controlsDisabled ? 0.5 : 1,
            cursor: controlsDisabled ? "not-allowed" : "pointer",
          }}
          onClick={fitModel}
          disabled={controlsDisabled}
          data-testid="fit-view-button"
        >
          Fit model
        </button>
        <button
          type="button"
          style={{
            ...buttonStyle,
            opacity: controlsDisabled ? 0.5 : 1,
            cursor: controlsDisabled ? "not-allowed" : "pointer",
          }}
          onClick={resetView}
          disabled={controlsDisabled}
          data-testid="reset-view-button"
        >
          Reset view
        </button>
        {printOrientation ? (
          <button
            type="button"
            style={{
              ...buttonStyle,
              ...(printPoseOn ? activeButtonStyle : null),
              opacity: controlsDisabled ? 0.5 : 1,
              cursor: controlsDisabled ? "not-allowed" : "pointer",
            }}
            onClick={() => setPrintPoseActive((active) => !active)}
            disabled={controlsDisabled}
            aria-pressed={printPoseOn}
            title={printOrientation.note}
            data-testid="print-pose-toggle"
          >
            Print pose
          </button>
        ) : null}
      </div>

      {printOrientation ? (
        <span style={printNoteStyle} data-testid="print-pose-note">
          {printOrientation.note}
        </span>
      ) : null}

      <div
        id="preview-status"
        role="status"
        aria-live="polite"
        style={statusStyle}
        data-testid="preview-status"
        data-status={effectiveStatus}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            flex: "0 0 auto",
            borderRadius: 999,
            background:
              effectiveStatus === "error"
                ? "#f87171"
                : effectiveStatus === "paused"
                  ? "#a8a29e"
                  : "#f6ad3c",
            boxShadow: isBusy ? "0 0 0 4px rgba(246, 173, 60, 0.14)" : "none",
          }}
        />
        <span>
          <strong>{statusLabel}</strong>
          {effectiveStatusDetail ? ` · ${effectiveStatusDetail}` : ""}
        </span>
      </div>

      <span id="model-viewer-help" style={hintStyle}>
        Drag to orbit · Scroll to zoom · Right-drag to pan
      </span>

      <div ref={rendererErrorRef} role="alert" style={rendererErrorStyle} hidden />
    </div>
  );
}
