/// <reference lib="webworker" />
import {
  handleGenerationRequest,
  transferablesOf,
  type GenerationRequest,
  type GenerationResponse,
} from "./protocol";

/**
 * Dedicated worker entry. It owns one Manifold kernel instance. Requests are
 * handled as they arrive; the kernel work itself is synchronous, so two
 * requests cannot interleave inside it. The page decides what to do with a
 * superseded result; the worker never drops a request on its own.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(response: GenerationResponse) {
  try {
    scope.postMessage(response, transferablesOf(response));
  } catch (error) {
    scope.postMessage({
      type: "error",
      id: response.id,
      message:
        error instanceof Error ? error.message : "The worker reply failed.",
    } satisfies GenerationResponse);
  }
}

scope.onmessage = async (event: MessageEvent<GenerationRequest>) => {
  const request = event.data;
  if (!request || request.type !== "generate") return;
  try {
    post(await handleGenerationRequest(request));
  } catch (error) {
    post({
      type: "error",
      id: request.id,
      message:
        error instanceof Error ? error.message : "Preview generation failed.",
    });
  }
};

// Backstops: anything that escapes the handler surfaces on the page as a
// worker error event instead of hanging the pending request.
scope.onunhandledrejection = (event) => {
  throw event.reason instanceof Error
    ? event.reason
    : new Error(String(event.reason));
};
