import { atom } from "jotai";
import { isWebGl2Available } from "./webGlSupport";

/**
 * Whether WebGL2 is available.
 * Will be set to false if renderer setup fails at runtime
 * (e.g. because of context-limit / driver failure).
 */
export const isWebgl2SupportedAtom = atom(isWebGl2Available());

/**
 * Set when the OffscreenCanvas chart worker fails (context creation
 * failure or unrecovered context loss); falls back to the main-thread
 * charts.
 */
export const offscreenChartFailedAtom = atom(false);
