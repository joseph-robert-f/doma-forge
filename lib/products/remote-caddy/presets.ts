import { normalizeFromSpecs } from "../shared";
import type { ProductPreset } from "../types";
import {
  REMOTE_CADDY_DEFAULTS,
  REMOTE_CADDY_SPECS,
  type RemoteCaddyParameters,
} from "./schema";

function preset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<RemoteCaddyParameters>,
): ProductPreset<RemoteCaddyParameters> {
  return {
    id,
    label,
    description,
    parameters: normalizeFromSpecs(REMOTE_CADDY_SPECS, REMOTE_CADDY_DEFAULTS, {
      ...REMOTE_CADDY_DEFAULTS,
      ...overrides,
    }),
  };
}

/**
 * Well widths are typical sizes, not a brand's. Measure your own remotes and
 * controllers with a caliper and set each well.
 */
export const REMOTE_CADDY_PRESETS: ProductPreset<RemoteCaddyParameters>[] = [
  preset("three-remotes", "Three remotes", "Three equal wells on a wide shelf", {
    caddyWidth: 240,
    caddyDepth: 130,
    caddyHeight: 60,
    wellWidths: [76, 78, 78],
    wellDepth: 45,
    frontWallHeight: 26,
  }),
  preset("two-controllers", "Two controllers", "Two deep wells for game controllers", {
    caddyWidth: 200,
    caddyDepth: 150,
    caddyHeight: 70,
    wellWidths: [97, 97],
    wellDepth: 55,
    frontWallHeight: 32,
  }),
  preset("five-wells", "Five wells", "Five narrow wells for a full shelf", {
    caddyWidth: 320,
    caddyDepth: 120,
    caddyHeight: 55,
    wellWidths: [60, 60, 60, 60, 68],
    wellDepth: 42,
    frontWallHeight: 24,
  }),
];
