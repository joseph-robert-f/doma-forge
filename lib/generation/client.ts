import type { GeneratedModel } from "../kernel/mesh";
import type { AnyParameters } from "../products/types";
import type {
  GenerationKind,
  GenerationRequest,
  GenerationResponse,
} from "./protocol";

/** Thrown for a request the client abandoned before a result arrived. */
export class GenerationCancelledError extends Error {
  constructor() {
    super("Generation was cancelled.");
    this.name = "GenerationCancelledError";
  }
}

export interface GenerationClient {
  /**
   * Generates one model, or the product's fit-test coupon when `kind` is
   * "coupon". Only the newest request matters: calling this while another
   * request is in flight cancels the older one, whose promise rejects with
   * GenerationCancelledError.
   */
  generate(
    productId: string,
    parameters: AnyParameters,
    kind?: GenerationKind,
  ): Promise<GeneratedModel<AnyParameters>>;
  /** Cancels the in-flight request, if any. */
  cancel(): void;
  /** Releases the worker. The client cannot be used afterwards. */
  dispose(): void;
}

/** The subset of the Worker API the client uses, so tests can fake it. */
export interface WorkerLike {
  postMessage(message: GenerationRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<GenerationResponse>) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface WorkerClientOptions {
  createWorker: () => WorkerLike;
  /**
   * A superseded request that has run for longer than this is killed by
   * terminating the worker, which also discards the warm kernel. Shorter
   * requests are left to finish and their result is dropped, because a
   * kernel reload costs more than the remaining work.
   */
  terminateAfterMs?: number;
  /**
   * A request still unanswered after this long is treated as a dead worker:
   * the worker is terminated and the request rejects with an error.
   */
  timeoutMs?: number;
  now?: () => number;
}

interface Pending {
  id: number;
  startedAt: number;
  watchdog: ReturnType<typeof setTimeout> | null;
  resolve: (model: GeneratedModel<AnyParameters>) => void;
  reject: (error: Error) => void;
}

const DEFAULT_TERMINATE_AFTER_MS = 1000;
const DEFAULT_TIMEOUT_MS = 30_000;

/** Runs generation in a dedicated worker with latest-wins semantics. */
export class WorkerGenerationClient implements GenerationClient {
  private worker: WorkerLike | null = null;
  private pending: Pending | null = null;
  private nextId = 1;
  private disposed = false;
  private readonly terminateAfterMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(private readonly options: WorkerClientOptions) {
    this.terminateAfterMs =
      options.terminateAfterMs ?? DEFAULT_TERMINATE_AFTER_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? (() => Date.now());
  }

  generate(
    productId: string,
    parameters: AnyParameters,
    kind: GenerationKind = "model",
  ): Promise<GeneratedModel<AnyParameters>> {
    if (this.disposed) {
      return Promise.reject(new Error("The generation client was disposed."));
    }
    this.abandonPending();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const pending: Pending = {
        id,
        startedAt: this.now(),
        watchdog: null,
        resolve,
        reject,
      };
      this.pending = pending;
      try {
        this.ensureWorker().postMessage({
          type: "generate",
          id,
          productId,
          parameters,
          kind,
        });
      } catch (error) {
        this.pending = null;
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      pending.watchdog = setTimeout(() => {
        if (this.pending !== pending) return;
        this.pending = null;
        this.worker?.terminate();
        this.worker = null;
        reject(
          new Error(
            `Generation did not finish within ${Math.round(this.timeoutMs / 1000)} s.`,
          ),
        );
      }, this.timeoutMs);
    });
  }

  cancel(): void {
    this.abandonPending();
  }

  dispose(): void {
    this.disposed = true;
    this.abandonPending();
    this.worker?.terminate();
    this.worker = null;
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.options.createWorker();
    worker.onmessage = (event) => {
      if (this.worker === worker) this.receive(event.data);
    };
    worker.onmessageerror = () => {
      if (this.worker !== worker) return;
      this.failWorker(worker, "The worker reply could not be read.");
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) {
        // A late error from a worker already replaced; nothing depends on it.
        worker.terminate();
        return;
      }
      this.failWorker(worker, event.message || "The generation worker failed.");
    };
    this.worker = worker;
    return worker;
  }

  private failWorker(worker: WorkerLike, message: string) {
    const pending = this.takePending();
    this.worker = null;
    worker.terminate();
    pending?.reject(new Error(message));
  }

  private receive(response: GenerationResponse) {
    if (!this.pending || this.pending.id !== response.id) return;
    const pending = this.takePending();
    if (!pending) return;
    if (response.type === "result") {
      pending.resolve(response.model);
    } else {
      pending.reject(new Error(response.message));
    }
  }

  /** Detaches the pending request and stops its watchdog. */
  private takePending(): Pending | null {
    const pending = this.pending;
    this.pending = null;
    if (pending?.watchdog) clearTimeout(pending.watchdog);
    return pending;
  }

  private abandonPending() {
    const pending = this.takePending();
    if (!pending) return;
    const elapsed = this.now() - pending.startedAt;
    if (elapsed > this.terminateAfterMs && this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    pending.reject(new GenerationCancelledError());
  }
}

/**
 * Runs generation on the calling thread through the same protocol. Used
 * where dedicated workers do not exist: server rendering and jsdom tests.
 * A superseded request still completes, but its result is dropped.
 */
export class InlineGenerationClient implements GenerationClient {
  private pending: Pending | null = null;
  private nextId = 1;
  private disposed = false;

  generate(
    productId: string,
    parameters: AnyParameters,
    kind: GenerationKind = "model",
  ): Promise<GeneratedModel<AnyParameters>> {
    if (this.disposed) {
      return Promise.reject(new Error("The generation client was disposed."));
    }
    this.cancel();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending = { id, startedAt: 0, watchdog: null, resolve, reject };
      const settle = (response: GenerationResponse) => {
        const pending = this.pending;
        if (!pending || pending.id !== response.id) return;
        this.pending = null;
        if (response.type === "result") pending.resolve(response.model);
        else pending.reject(new Error(response.message));
      };
      // The protocol module pulls in only the geometry loader table, and
      // each product's geometry and the kernel load on demand from there.
      // Loading the protocol lazily keeps even that table out of the page
      // bundle in browsers, where the worker client is used instead.
      import("./protocol")
        .then(({ handleGenerationRequest }) =>
          handleGenerationRequest({
            type: "generate",
            id,
            productId,
            parameters,
            kind,
          }),
        )
        .then(settle)
        .catch((error: unknown) =>
          settle({
            type: "error",
            id,
            message:
              error instanceof Error
                ? error.message
                : "Preview generation failed.",
          }),
        );
    });
  }

  cancel(): void {
    const pending = this.pending;
    this.pending = null;
    pending?.reject(new GenerationCancelledError());
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }
}

/** Picks the worker client in browsers and the inline client elsewhere. */
export function createGenerationClient(): GenerationClient {
  if (typeof Worker === "undefined") return new InlineGenerationClient();
  return new WorkerGenerationClient({
    createWorker: () =>
      new Worker(new URL("./generation.worker.ts", import.meta.url), {
        type: "module",
        name: "drawerforge-generation",
      }),
  });
}
