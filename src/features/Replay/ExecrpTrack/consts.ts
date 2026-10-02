import type { RgbColor } from "../../WebGl/webglUtils.ts";

export type ExecrpGranularity = "txn" | "txn_batch";

/**
 * At/above this visible span the track always uses batched granularity and the
 * granularity toggle is hidden; below it the toggle chooses txn vs txn_batch.
 */
export const TXN_MAX_MS = 5 * 60_000;

/** At/above this visible span the track is hidden (too coarse to be useful). */
export const BATCH_MAX_MS = 5 * 60 * 60 * 1000; // 5 hours

/** Fraction of a row's height used by a bar, leaving a gap between rows. */
export const ROW_FILL = 0.9;

/** Vertical bounds of the view/coordinate space. */
export const minY = 0;
export const maxY = 1;

export const ROW_HEIGHT_PX = 24;

/**
 * Alpha applied (via a single material opacity) to the fill mesh. The shared rect
 * mesh has RGB-only instance colors, so per-color alpha is approximated with one
 * opacity. State segments and sigverify bars share this opacity so they can share
 * one mesh per tile (they differ only in color).
 */
export const FILL_ALPHA = 0.5;
export const OUTLINE_ALPHA = 0.5;
export const OUTLINE_BORDER_PX = 1.5;

export const OUTLINE_ERROR_RGB: RgbColor = [162 / 255, 5 / 255, 8 / 255];
export const OUTLINE_SUCCESS_RGB: RgbColor = [19 / 255, 173 / 255, 79 / 255];
export const SIGVERIFY_RGB: RgbColor = [139 / 255, 92 / 255, 246 / 255];

export interface ExecrpViewOpts {
  /** Draw the per-txn success/error borders. */
  showOutlines: boolean;
  /** Preferred granularity below TXN_MAX_MS (above it, batch is forced). */
  granularity: ExecrpGranularity;
}

export const DEFAULT_EXECRP_VIEW_OPTS: ExecrpViewOpts = {
  showOutlines: true,
  granularity: "txn",
};
