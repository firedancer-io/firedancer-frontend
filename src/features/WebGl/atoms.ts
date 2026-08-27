import { atom } from "jotai";
import { isWebGl2Available } from "./webGlSupport";

/**
 * Whether WebGL2 is available. Probed lazily on first read (the eager
 * module-scope probe cost 14-20ms of entry eval; the offscreen path
 * never needs it). Set to false if renderer setup fails at runtime
 * (e.g. because of context-limit / driver failure).
 */
const webgl2ProbeAtom = atom<boolean | null>(null);
export const isWebgl2SupportedAtom = atom(
  (get) => get(webgl2ProbeAtom) ?? isWebGl2Available(),
  (_get, set, value: boolean) => set(webgl2ProbeAtom, value),
);

/**
 * Set when the OffscreenCanvas chart worker fails (context creation
 * failure or unrecovered context loss); falls back to the main-thread
 * charts.
 */
export const offscreenChartFailedAtom = atom(false);

export const isOffscreenChartSupported =
  typeof Worker !== "undefined" &&
  typeof OffscreenCanvas !== "undefined" &&
  typeof HTMLCanvasElement !== "undefined" &&
  !!HTMLCanvasElement.prototype.transferControlToOffscreen;
