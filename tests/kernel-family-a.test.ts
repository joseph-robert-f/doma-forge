import { describe, expect, it } from "vitest";
import { dividerArrayAtPositions } from "../lib/kernel/arrays";
import {
  LEG_MAXIMUM_SLENDERNESS,
  LEG_MINIMUM_GAP_MM,
  LEG_MINIMUM_SECTION_MM,
  legPost,
  legPosts,
  planLegPosts,
} from "../lib/kernel/legs";
import { getKernel } from "../lib/kernel/manifold";
import { BOOLEAN_OVERLAP, roundedSlab } from "../lib/kernel/shell";

const SEGMENTS = 24;

/** The two family A extensions of sprint S07: divider positions and legs. */

describe("divider array at explicit positions", () => {
  it("places one divider per position and clips it to the outer body", async () => {
    const kernel = await getKernel();
    const outer = roundedSlab(kernel, {
      width: 100,
      depth: 60,
      height: 20,
      cornerRadius: 5,
      segments: SEGMENTS,
    });
    const dividers = dividerArrayAtPositions(kernel, outer, {
      positions: [-20, 20],
      thickness: 2,
      length: 60 + BOOLEAN_OVERLAP * 2,
      height: 20,
      centerZ: 10,
    });
    expect(dividers).not.toBeNull();
    const box = dividers!.boundingBox();
    // The clip keeps the dividers inside the slab on every axis.
    expect(box.min[0]).toBeCloseTo(-21, 6);
    expect(box.max[0]).toBeCloseTo(21, 6);
    expect(box.min[1]).toBeCloseTo(-30, 6);
    expect(box.max[1]).toBeCloseTo(30, 6);
    expect(box.min[2]).toBeCloseTo(0, 6);
    expect(box.max[2]).toBeCloseTo(20, 6);
    expect(dividers!.volume()).toBeCloseTo(2 * 2 * 60 * 20, 4);
    dividers!.delete();
    outer.delete();
  });

  it("shortens a divider that runs into a rounded outer corner", async () => {
    const kernel = await getKernel();
    const outer = roundedSlab(kernel, {
      width: 100,
      depth: 60,
      height: 20,
      cornerRadius: 20,
      segments: SEGMENTS,
    });
    const dividers = dividerArrayAtPositions(kernel, outer, {
      positions: [48],
      thickness: 2,
      length: 60 + BOOLEAN_OVERLAP * 2,
      height: 20,
      centerZ: 10,
    })!;
    const box = dividers.boundingBox();
    // The divider sits in the corner region, so the corner radius cuts it
    // short instead of letting it stand outside the body.
    expect(box.max[1] - box.min[1]).toBeLessThan(60);
    expect(box.max[0]).toBeLessThanOrEqual(49 + 1e-9);
    expect(dividers.volume()).toBeGreaterThan(0);
    dividers.delete();
    outer.delete();
  });

  it("stands the dividers across the Y axis when the axis is y", async () => {
    const kernel = await getKernel();
    const outer = roundedSlab(kernel, {
      width: 100,
      depth: 60,
      height: 20,
      cornerRadius: 5,
      segments: SEGMENTS,
    });
    const dividers = dividerArrayAtPositions(kernel, outer, {
      positions: [0],
      thickness: 2,
      length: 100 + BOOLEAN_OVERLAP * 2,
      height: 20,
      centerZ: 10,
      axis: "y",
    })!;
    const box = dividers.boundingBox();
    expect(box.max[0] - box.min[0]).toBeGreaterThan(80);
    expect(box.max[1] - box.min[1]).toBeCloseTo(2, 6);
    dividers.delete();
    outer.delete();
  });

  it("returns null for an empty position list", async () => {
    const kernel = await getKernel();
    const outer = roundedSlab(kernel, {
      width: 60,
      depth: 40,
      height: 10,
      cornerRadius: 2,
      segments: SEGMENTS,
    });
    expect(
      dividerArrayAtPositions(kernel, outer, {
        positions: [],
        thickness: 2,
        length: 40,
        height: 10,
        centerZ: 5,
      }),
    ).toBeNull();
    outer.delete();
  });

  it("refuses a size or a position that is not a finite number", async () => {
    const kernel = await getKernel();
    const outer = roundedSlab(kernel, {
      width: 60,
      depth: 40,
      height: 10,
      cornerRadius: 2,
      segments: SEGMENTS,
    });
    const options = {
      positions: [0],
      thickness: 2,
      length: 40,
      height: 10,
      centerZ: 5,
    };
    expect(() =>
      dividerArrayAtPositions(kernel, outer, { ...options, thickness: Number.NaN }),
    ).toThrow(/finite, positive/);
    expect(() =>
      dividerArrayAtPositions(kernel, outer, { ...options, height: 0 }),
    ).toThrow(/finite, positive/);
    expect(() =>
      dividerArrayAtPositions(kernel, outer, { ...options, positions: [Number.NaN] }),
    ).toThrow(/finite positions/);
    outer.delete();
  });
});

describe("leg post plan", () => {
  const request = {
    deckWidth: 200,
    deckDepth: 120,
    section: 12,
    height: 60,
    inset: 8,
  };

  it("places four posts inside the deck corners", () => {
    const plan = planLegPosts(request);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.centers).toEqual([
      [-86, -46],
      [86, -46],
      [86, 46],
      [-86, 46],
    ]);
    expect(plan.slenderness).toBeCloseTo(5, 10);
  });

  it("accepts a leg exactly at the slenderness limit and refuses one over it", () => {
    const atLimit = planLegPosts({ ...request, section: 10, height: 120 });
    expect(atLimit.ok).toBe(true);
    if (atLimit.ok) expect(atLimit.slenderness).toBeCloseTo(LEG_MAXIMUM_SLENDERNESS, 10);
    const overLimit = planLegPosts({ ...request, section: 10, height: 120.5 });
    expect(overLimit.ok).toBe(false);
    if (overLimit.ok) return;
    expect(overLimit.reason).toBe("slenderness");
    expect(overLimit.maximumHeight).toBe(120);
    expect(overLimit.minimumSection).toBeCloseTo(10.042, 3);
  });

  it("accepts a section exactly at the minimum and refuses one under it", () => {
    const atMinimum = planLegPosts({ ...request, section: LEG_MINIMUM_SECTION_MM, height: 90 });
    expect(atMinimum.ok).toBe(true);
    const underMinimum = planLegPosts({ ...request, section: 7.9, height: 60 });
    expect(underMinimum.ok).toBe(false);
    if (underMinimum.ok) return;
    expect(underMinimum.reason).toBe("section");
    expect(underMinimum.minimumSection).toBe(LEG_MINIMUM_SECTION_MM);
  });

  it("refuses posts that leave less than the minimum gap", () => {
    // 60 mm deep deck, 10 mm inset, 20 mm posts: 60 - 2 * 30 = 0 mm between.
    const plan = planLegPosts({
      deckWidth: 200,
      deckDepth: 60,
      section: 20,
      height: 60,
      inset: 10,
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("gap");
    expect(plan.gap).toBeCloseTo(0, 10);
    const wider = planLegPosts({
      deckWidth: 200,
      deckDepth: 60 + LEG_MINIMUM_GAP_MM,
      section: 20,
      height: 60,
      inset: 10,
    });
    expect(wider.ok).toBe(true);
  });

  it("never throws on a cleared field and reports the value reason", () => {
    for (const key of ["deckWidth", "deckDepth", "section", "height", "inset"] as const) {
      const plan = planLegPosts({ ...request, [key]: Number.NaN });
      expect(plan.ok).toBe(false);
      if (plan.ok) return;
      expect(plan.reason).toBe("value");
    }
  });
});

describe("leg post geometry", () => {
  it("builds a post that stands from the floor and flares into the deck", async () => {
    const kernel = await getKernel();
    const post = legPost(kernel, {
      centers: [[0, 0]],
      section: 12,
      cornerRadius: 2,
      height: 40,
      gusset: 6,
      segments: SEGMENTS,
    });
    const box = post.boundingBox();
    expect(box.min[2]).toBeCloseTo(0, 6);
    expect(box.max[2]).toBeCloseTo(40 + BOOLEAN_OVERLAP, 6);
    // The shaft is 12 mm square; the gusset makes the deck end 24 mm square.
    expect(box.max[0] - box.min[0]).toBeCloseTo(24, 6);
    expect(box.max[1] - box.min[1]).toBeCloseTo(24, 6);
    // A plain shaft would hold 12 * 12 * 40.2 mm3. The gusset adds material.
    expect(post.volume()).toBeGreaterThan(12 * 12 * 40);
    expect(post.status()).toBe("NoError");
    post.delete();
  });

  it("keeps the post square along its whole shaft without a gusset", async () => {
    const kernel = await getKernel();
    const post = legPost(kernel, {
      centers: [[0, 0]],
      section: 10,
      cornerRadius: 0,
      height: 30,
      gusset: 0,
      segments: SEGMENTS,
    });
    const box = post.boundingBox();
    expect(box.max[0] - box.min[0]).toBeCloseTo(10, 6);
    expect(post.volume()).toBeCloseTo(10 * 10 * (30 + BOOLEAN_OVERLAP), 4);
    post.delete();
  });

  it("places one post per plan center", async () => {
    const kernel = await getKernel();
    const plan = planLegPosts({
      deckWidth: 200,
      deckDepth: 120,
      section: 12,
      height: 40,
      inset: 8,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const posts = legPosts(kernel, {
      centers: plan.centers,
      section: 12,
      cornerRadius: 2,
      height: 40,
      gusset: 6,
      segments: SEGMENTS,
    });
    const box = posts.boundingBox();
    expect(box.max[0]).toBeCloseTo(86 + 12, 6);
    expect(box.max[1]).toBeCloseTo(46 + 12, 6);
    expect(box.max[2]).toBeCloseTo(40 + BOOLEAN_OVERLAP, 6);
    expect(posts.status()).toBe("NoError");
    posts.delete();
  });

  it("refuses a post with a section or a height that is not positive", async () => {
    const kernel = await getKernel();
    const options = {
      centers: [[0, 0]] as Array<[number, number]>,
      section: 12,
      cornerRadius: 2,
      height: 40,
      gusset: 4,
      segments: SEGMENTS,
    };
    expect(() => legPost(kernel, { ...options, section: 0 })).toThrow(/finite, positive/);
    expect(() => legPost(kernel, { ...options, height: Number.NaN })).toThrow(
      /finite, positive/,
    );
    expect(() => legPosts(kernel, { ...options, centers: [] })).toThrow(
      /at least one post center/,
    );
  });
});
