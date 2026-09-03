import type { GeneratedModel } from "../kernel/mesh";
import { loadGeometry } from "../products/geometry-registry";
import type { AnyParameters } from "../products/types";

/**
 * What a request builds: the full model, or the product's fit-test coupon.
 * Both run in the worker, so the page never loads the kernel. See
 * 28_CONTRACT_FOLLOW_UPS_NOTES.md, decision D-1702.
 */
export type GenerationKind = "model" | "coupon";

/** Sent from the page to the worker. One request per generation. */
export interface GenerationRequest {
  type: "generate";
  id: number;
  productId: string;
  parameters: AnyParameters;
  kind: GenerationKind;
}

/** Sent from the worker back to the page. Exactly one per request. */
export type GenerationResponse =
  | { type: "result"; id: number; model: GeneratedModel<AnyParameters> }
  | { type: "error"; id: number; message: string };

/**
 * Runs one generation request. This is the whole worker body, kept as a pure
 * function so the same code can run on the main thread when workers are
 * unavailable and so tests can drive it without a real worker.
 */
export async function handleGenerationRequest(
  request: GenerationRequest,
): Promise<GenerationResponse> {
  try {
    const geometry = await loadGeometry(request.productId);
    if (request.kind === "coupon" && !geometry.coupon) {
      throw new Error(`${request.productId} has no fit-test coupon.`);
    }
    const model =
      request.kind === "coupon" && geometry.coupon
        ? await geometry.coupon(request.parameters)
        : await geometry.generate(request.parameters);
    return { type: "result", id: request.id, model };
  } catch (error) {
    return {
      type: "error",
      id: request.id,
      message:
        error instanceof Error ? error.message : "Preview generation failed.",
    };
  }
}

/** The ArrayBuffers a result response owns, for zero-copy transfer. */
export function transferablesOf(response: GenerationResponse): ArrayBuffer[] {
  if (response.type !== "result") return [];
  const { vertProperties, triVerts } = response.model.mesh;
  const buffers = new Set<ArrayBuffer>([
    vertProperties.buffer as ArrayBuffer,
    triVerts.buffer as ArrayBuffer,
  ]);
  return [...buffers];
}
