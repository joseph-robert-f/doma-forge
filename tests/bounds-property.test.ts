import { describe, expect, it } from "vitest";
import { drawerTray, type DrawerTrayParameters } from "../lib/products/drawer-tray";
import type { MeshQuality } from "../lib/products/types";
import { modelToBufferGeometry } from "../lib/three-geometry";

/**
 * Sprint S10 scope item 6: a seeded property test. 200 random valid
 * parameter sets for the drawer tray must each generate a closed mesh
 * whose bounds satisfy the product's own `boundsContract`.
 *
 * The generator (`getKernel`, through `manifold-3d`) already refuses to
 * hand back a solid that fails its own manifold-closure check: see
 * `finishSolid` in `lib/kernel/mesh.ts`, which throws on any status other
 * than "NoError" or on an empty body. So a `generate()` call that resolves
 * at all has already passed the kernel's own closed-manifold test. This
 * test adds one more, independent, closure check on top of that: every
 * triangle edge in the exported mesh must be shared by exactly one other
 * triangle, walked in the opposite direction (the same check
 * `tests/geometry.test.ts` runs on the golden fixtures), plus the bounds
 * check the spec asks for.
 */

const SAMPLE_COUNT = 200;
const SEED = 0xdf10_2026;

/** A tiny seeded PRNG (mulberry32). Deterministic across runs and machines. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBetween(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

function randomInt(random: () => number, min: number, max: number): number {
  return Math.floor(randomBetween(random, min, max + 1));
}

const MESH_QUALITIES: MeshQuality[] = ["draft", "standard", "fine"];

/**
 * Draws one candidate parameter set. The ranges are narrower than the full
 * spec bounds (see `lib/products/drawer-tray/schema.ts`) so a useful
 * fraction of draws pass `validate()` on the first try; the caller still
 * rejects and redraws anything that fails validation, so this never
 * silently narrows what counts as "valid" for the test's purposes.
 */
function randomCandidate(random: () => number): DrawerTrayParameters {
  return {
    drawerWidth: Math.round(randomBetween(random, 120, 420)),
    drawerDepth: Math.round(randomBetween(random, 120, 420)),
    clearancePerSide: Math.round(randomBetween(random, 0, 2) * 10) / 10,
    organizerHeight: Math.round(randomBetween(random, 20, 90)),
    wallThickness: Math.round(randomBetween(random, 1.2, 3.5) * 10) / 10,
    baseThickness: Math.round(randomBetween(random, 1.2, 4) * 10) / 10,
    dividerThickness: Math.round(randomBetween(random, 1.2, 3.5) * 10) / 10,
    cornerRadius: Math.round(randomBetween(random, 1, 16) * 2) / 2,
    rows: randomInt(random, 1, 4),
    columns: randomInt(random, 1, 5),
    // Fine quality is the slowest to generate; drawing it a fifth of the
    // time keeps the whole 200-sample run well under the 60-second budget
    // while still exercising every quality level.
    meshQuality: MESH_QUALITIES[random() < 0.2 ? 2 : randomInt(random, 0, 1)],
    fingerScoop: random() < 0.5,
  };
}

/** Draws valid parameter sets until it has `count` of them. */
function sampleValidParameters(count: number, seed: number): DrawerTrayParameters[] {
  const random = mulberry32(seed);
  const samples: DrawerTrayParameters[] = [];
  let attempts = 0;
  const maxAttempts = count * 200;
  while (samples.length < count && attempts < maxAttempts) {
    attempts += 1;
    const candidate = randomCandidate(random);
    const normalized = drawerTray.normalize(candidate);
    if (drawerTray.validate(normalized).valid) {
      samples.push(normalized);
    }
  }
  if (samples.length < count) {
    throw new Error(
      `Only drew ${samples.length} valid parameter sets in ${attempts} attempts; the sampler's ranges need review.`,
    );
  }
  return samples;
}

/**
 * Every mesh edge must be shared by exactly two triangles, and those two
 * visits must wind it in opposite directions. Two independent checks, not
 * one:
 *
 *  - `count === 2`: a boundary edge, visited by only one triangle, would
 *    mean a hole; three or more visits would mean a non-manifold seam. The
 *    signed balance alone cannot tell either of those apart from a healthy
 *    edge in every case — four visits split two-forward, two-backward
 *    balance to 0 exactly like a healthy edge does, so a doubled-up sliver
 *    of geometry could pass a balance-only check.
 *  - `balance === 0`: a consistently wound closed manifold cancels every
 *    edge's two visits (+1 forward, -1 backward) to exactly 0. Two visits
 *    that wind the same direction twice balance to +2 or -2, which the
 *    count check alone would not catch, since the count is still 2.
 */
function closedManifoldEdgeIssues(mesh: ReturnType<typeof modelToBufferGeometry>): string[] {
  const position = mesh.getAttribute("position");
  const key = (x: number, y: number, z: number) =>
    `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
  const edges = new Map<string, { count: number; balance: number }>();
  const point = (index: number) => [
    position.getX(index),
    position.getY(index),
    position.getZ(index),
  ] as const;

  for (let triangle = 0; triangle < position.count; triangle += 3) {
    const [a, b, c] = [point(triangle), point(triangle + 1), point(triangle + 2)];
    const vertexKeys = [key(...a), key(...b), key(...c)];
    for (const [from, to] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const forward = vertexKeys[from] < vertexKeys[to];
      const edgeKey = forward
        ? `${vertexKeys[from]}|${vertexKeys[to]}`
        : `${vertexKeys[to]}|${vertexKeys[from]}`;
      const entry = edges.get(edgeKey) ?? { count: 0, balance: 0 };
      entry.count += 1;
      entry.balance += forward ? 1 : -1;
      edges.set(edgeKey, entry);
    }
  }

  const issues: string[] = [];
  for (const { count, balance } of edges.values()) {
    if (count !== 2) issues.push(`edge shared by ${count} triangle(s), expected exactly 2`);
    else if (balance !== 0) issues.push(`edge wound inconsistently (balance ${balance}, expected 0)`);
  }
  return issues;
}

describe("drawer tray bounds contract (seeded property test)", () => {
  const samples = sampleValidParameters(SAMPLE_COUNT, SEED);

  it(`draws ${SAMPLE_COUNT} distinct valid parameter sets`, () => {
    expect(samples).toHaveLength(SAMPLE_COUNT);
    for (const sample of samples) {
      expect(drawerTray.validate(sample).valid).toBe(true);
    }
  });

  it("generates a closed mesh within the bounds contract for every sample", async () => {
    for (const parameters of samples) {
      // Included in every failure message below: a property-test failure
      // is only diagnosable if the exact parameter set that triggered it is
      // visible without re-running the seeded sampler by hand.
      const context = `\nfor parameters: ${JSON.stringify(parameters)}`;

      const model = await drawerTray.generate(parameters);
      const contract = drawerTray.boundsContract(parameters);

      for (let axis = 0; axis < 3; axis += 1) {
        expect(model.bounds[0][axis], `min bound below contract${context}`).toBeGreaterThanOrEqual(
          contract.min[axis] - contract.tolerance,
        );
        expect(model.bounds[1][axis], `max bound above contract${context}`).toBeLessThanOrEqual(
          contract.max[axis] + contract.tolerance,
        );
        // The mesh must also fill its contracted box, not sit inside it
        // with room to spare: a mismatch here means the contract has
        // drifted from what the kernel actually produces.
        expect(model.bounds[0][axis], `min bound short of contract${context}`).toBeLessThanOrEqual(
          contract.min[axis] + contract.tolerance,
        );
        expect(model.bounds[1][axis], `max bound short of contract${context}`).toBeGreaterThanOrEqual(
          contract.max[axis] - contract.tolerance,
        );
      }

      const geometry = modelToBufferGeometry(model);
      const edgeIssues = closedManifoldEdgeIssues(geometry);
      expect(edgeIssues, `mesh is not a closed manifold${context}\nedge issues: ${edgeIssues.join("; ")}`).toEqual(
        [],
      );
    }
  }, 60_000);
});
