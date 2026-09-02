import ManifoldModule, { type ManifoldToplevel } from "manifold-3d";
import manifoldWasmUrl from "manifold-3d/manifold.wasm?url";

export type Solid = InstanceType<ManifoldToplevel["Manifold"]>;

let manifoldModulePromise: Promise<ManifoldToplevel> | null = null;

/**
 * Loads the Manifold WebAssembly kernel once per runtime. Node test runs let
 * Emscripten locate the .wasm file itself; browsers use the bundled asset URL.
 */
export async function getKernel(): Promise<ManifoldToplevel> {
  const isNodeRuntime =
    typeof process !== "undefined" && Boolean(process.versions?.node);
  manifoldModulePromise ??= ManifoldModule(
    isNodeRuntime ? undefined : { locateFile: () => manifoldWasmUrl },
  )
    .then((kernel) => {
      kernel.setup();
      return kernel;
    })
    .catch((error: unknown) => {
      manifoldModulePromise = null;
      throw error;
    });
  return manifoldModulePromise;
}
