import { describe, expect, it, vi } from "vitest";
import {
  GenerationCancelledError,
  InlineGenerationClient,
  WorkerGenerationClient,
  type WorkerLike,
} from "../lib/generation/client";
import {
  handleGenerationRequest,
  transferablesOf,
  type GenerationRequest,
  type GenerationResponse,
} from "../lib/generation/protocol";
import { drawerTray } from "../lib/products/drawer-tray";
import { PRODUCTS } from "../lib/products/registry";

const defaults = drawerTray.normalize(drawerTray.defaults);

/**
 * A worker double that runs the real protocol handler on the calling thread.
 * Responses can be held back so tests can order supersede and reply events.
 */
class FakeWorker implements WorkerLike {
  onmessage: WorkerLike["onmessage"] = null;
  onmessageerror: WorkerLike["onmessageerror"] = null;
  onerror: WorkerLike["onerror"] = null;
  terminated = false;
  readonly requests: GenerationRequest[] = [];
  private held: GenerationResponse[] = [];

  constructor(private readonly hold = false) {}

  postMessage(message: GenerationRequest) {
    this.requests.push(message);
    void handleGenerationRequest(message).then((response) => {
      if (this.terminated) return;
      if (this.hold) this.held.push(response);
      else this.deliver(response);
    });
  }

  /** Delivers held replies once `count` of them have been produced. */
  async release(count = 1) {
    await vi.waitFor(() =>
      expect(this.held.length).toBeGreaterThanOrEqual(count),
    );
    const queued = this.held;
    this.held = [];
    for (const response of queued) this.deliver(response);
  }

  deliver(response: GenerationResponse) {
    this.onmessage?.({ data: response } as MessageEvent<GenerationResponse>);
  }

  fail(message: string) {
    this.onerror?.({ message } as ErrorEvent);
  }

  terminate() {
    this.terminated = true;
  }
}

describe("generation protocol", () => {
  it("answers a request with a transferable model", async () => {
    const response = await handleGenerationRequest({
      type: "generate",
      id: 7,
      productId: drawerTray.id,
      kind: "model",
      parameters: defaults,
    });
    expect(response.type).toBe("result");
    expect(response.id).toBe(7);
    if (response.type !== "result") throw new Error("unreachable");
    expect(response.model.mesh.triVerts.length / 3).toBe(360);
    const buffers = transferablesOf(response);
    expect(buffers).toHaveLength(2);
    expect(buffers).toContain(response.model.mesh.vertProperties.buffer);
    expect(buffers).toContain(response.model.mesh.triVerts.buffer);
  });

  it("reports an unknown product or invalid parameters as an error message", async () => {
    const unknown = await handleGenerationRequest({
      type: "generate",
      id: 1,
      productId: "missing",
      kind: "model",
      parameters: defaults,
    });
    expect(unknown).toEqual({
      type: "error",
      id: 1,
      message: "Unknown product: missing",
    });

    const invalid = await handleGenerationRequest({
      type: "generate",
      id: 2,
      productId: drawerTray.id,
      kind: "model",
      parameters: { ...defaults, drawerWidth: 10 },
    });
    expect(invalid.type).toBe("error");
    expect(transferablesOf(invalid)).toEqual([]);
  });

  it("builds the fit-test coupon for a coupon request, in the same worker", async () => {
    const response = await handleGenerationRequest({
      type: "generate",
      id: 3,
      productId: drawerTray.id,
      kind: "coupon",
      parameters: defaults,
    });
    expect(response.type).toBe("result");
    if (response.type !== "result") throw new Error("unreachable");
    // The coupon is the 5 mm ring, not the 50 mm tray.
    const zs = Array.from(response.model.mesh.vertProperties).filter(
      (_, index) => index % 3 === 2,
    );
    expect(Math.max(...zs)).toBeCloseTo(5, 6);
    expect(response.model.mesh.triVerts.length / 3).toBeLessThan(360);
  });

  it("refuses a coupon request for a product that has no coupon", async () => {
    const product = PRODUCTS.find((candidate) => !candidate.coupon);
    if (!product) throw new Error("every product has a coupon");
    const response = await handleGenerationRequest({
      type: "generate",
      id: 4,
      productId: product.id,
      kind: "coupon",
      parameters: product.defaults,
    });
    expect(response).toEqual({
      type: "error",
      id: 4,
      message: `${product.id} has no fit-test coupon.`,
    });
  });
});

describe("worker generation client", () => {
  it("resolves the newest request and rejects the superseded one", async () => {
    const worker = new FakeWorker(true);
    const client = new WorkerGenerationClient({ createWorker: () => worker });

    const first = client.generate(drawerTray.id, defaults);
    const second = client.generate(drawerTray.id, { ...defaults, rows: 1 });
    await expect(first).rejects.toBeInstanceOf(GenerationCancelledError);

    await worker.release(2);
    const model = await second;
    expect(model.parameters.rows).toBe(1);
    expect(worker.requests.map((request) => request.id)).toEqual([1, 2]);
    expect(worker.terminated).toBe(false);
  });

  it("keeps the warm worker when a short request is superseded", async () => {
    let clock = 0;
    const worker = new FakeWorker(true);
    const client = new WorkerGenerationClient({
      createWorker: () => worker,
      terminateAfterMs: 1000,
      now: () => clock,
    });
    const first = client.generate(drawerTray.id, defaults);
    clock = 500;
    const second = client.generate(drawerTray.id, defaults);
    await expect(first).rejects.toBeInstanceOf(GenerationCancelledError);
    expect(worker.terminated).toBe(false);
    await worker.release(2);
    await expect(second).resolves.toBeTruthy();
  });

  it("terminates a long superseded request and starts a fresh worker", async () => {
    let clock = 0;
    const workers: FakeWorker[] = [];
    const client = new WorkerGenerationClient({
      createWorker: () => {
        const worker = new FakeWorker(true);
        workers.push(worker);
        return worker;
      },
      terminateAfterMs: 1000,
      now: () => clock,
    });
    const first = client.generate(drawerTray.id, defaults);
    clock = 1500;
    const second = client.generate(drawerTray.id, defaults);
    await expect(first).rejects.toBeInstanceOf(GenerationCancelledError);
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    await workers[1].release();
    await expect(second).resolves.toBeTruthy();
  });

  it("ignores a late reply for a request that was already abandoned", async () => {
    const worker = new FakeWorker(true);
    const client = new WorkerGenerationClient({ createWorker: () => worker });
    const first = client.generate(drawerTray.id, defaults);
    client.cancel();
    await expect(first).rejects.toBeInstanceOf(GenerationCancelledError);
    await worker.release();
    const next = client.generate(drawerTray.id, defaults);
    await worker.release();
    await expect(next).resolves.toBeTruthy();
  });

  it("ignores a late error from a worker it already replaced", async () => {
    let clock = 0;
    const workers: FakeWorker[] = [];
    const client = new WorkerGenerationClient({
      createWorker: () => {
        const worker = new FakeWorker(true);
        workers.push(worker);
        return worker;
      },
      terminateAfterMs: 100,
      now: () => clock,
    });
    const first = client.generate(drawerTray.id, defaults);
    clock = 500;
    const second = client.generate(drawerTray.id, defaults);
    await expect(first).rejects.toBeInstanceOf(GenerationCancelledError);
    expect(workers).toHaveLength(2);

    workers[0].fail("late crash from the old worker");
    await workers[1].release();
    await expect(second).resolves.toBeTruthy();
  });

  it("times out a request the worker never answers and recovers", async () => {
    const workers: FakeWorker[] = [];
    const client = new WorkerGenerationClient({
      createWorker: () => {
        const worker = new FakeWorker(true);
        workers.push(worker);
        return worker;
      },
      timeoutMs: 80,
    });
    await expect(client.generate(drawerTray.id, defaults)).rejects.toThrow(
      /did not finish/,
    );
    expect(workers[0].terminated).toBe(true);

    const second = client.generate(drawerTray.id, defaults);
    expect(workers).toHaveLength(2);
    await workers[1].release();
    await expect(second).resolves.toBeTruthy();
  });

  it("rejects the pending request on a reply that cannot be read", async () => {
    const worker = new FakeWorker(true);
    const client = new WorkerGenerationClient({ createWorker: () => worker });
    const first = client.generate(drawerTray.id, defaults);
    worker.onmessageerror?.({} as MessageEvent);
    await expect(first).rejects.toThrow(/could not be read/);
    expect(worker.terminated).toBe(true);
  });

  it("surfaces a worker error message and recovers on the next request", async () => {
    const workers: FakeWorker[] = [];
    const client = new WorkerGenerationClient({
      createWorker: () => {
        const worker = new FakeWorker(true);
        workers.push(worker);
        return worker;
      },
    });
    const first = client.generate(drawerTray.id, defaults);
    workers[0].fail("Script error in worker");
    await expect(first).rejects.toThrow("Script error in worker");
    expect(workers[0].terminated).toBe(true);

    const second = client.generate(drawerTray.id, defaults);
    expect(workers).toHaveLength(2);
    await workers[1].release();
    await expect(second).resolves.toBeTruthy();
  });

  it("passes kernel validation failures through as rejected promises", async () => {
    const worker = new FakeWorker();
    const client = new WorkerGenerationClient({ createWorker: () => worker });
    await expect(
      client.generate(drawerTray.id, { ...defaults, drawerWidth: 10 }),
    ).rejects.toThrow(/Drawer width must be between/);
  });

  it("refuses new work after dispose", async () => {
    const worker = new FakeWorker();
    const client = new WorkerGenerationClient({ createWorker: () => worker });
    await client.generate(drawerTray.id, defaults);
    client.dispose();
    expect(worker.terminated).toBe(true);
    await expect(client.generate(drawerTray.id, defaults)).rejects.toThrow(
      /disposed/,
    );
  });
});

describe("inline generation client", () => {
  it("generates on the calling thread with latest-wins semantics", async () => {
    const client = new InlineGenerationClient();
    const first = client.generate(drawerTray.id, defaults);
    const second = client.generate(drawerTray.id, { ...defaults, columns: 1 });
    await expect(first).rejects.toBeInstanceOf(GenerationCancelledError);
    const model = await second;
    expect(model.parameters.columns).toBe(1);
    client.dispose();
    await expect(client.generate(drawerTray.id, defaults)).rejects.toThrow(
      /disposed/,
    );
  });
});
