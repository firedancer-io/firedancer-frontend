import type { LiveShreds } from "../../../../../api/types";
import type { LiveShredsData } from "../../../../../api/worker/cache/shreds/types";
import type { LabelFrame } from "../../labelsCalc";

/** Main thread -> shreds chart worker */
export type ToChartWorker =
  | {
      type: "init";
      canvas: OffscreenCanvas;
      pixelRatio: number;
      scale: number;
    }
  | { type: "resize"; width: number; height: number }
  | { type: "scale"; scale: number }
  | {
      type: "state";
      serverTimeMs: number | undefined;
      showStartup: boolean;
      slotCaughtUp: number | null;
      disconnected: boolean;
    }
  | { type: "skipped"; slots: number[] }
  // slot:live_shreds values pumped worker-to-worker from wsWorker
  // (useWsWorker.openShredsChartPort), bypassing the main thread
  | { type: "shredsPort"; port: MessagePort };

/** Messages arriving on the wsWorker -> chart worker port */
export type ShredsPortMessage =
  | { type: "shreds"; value: LiveShreds }
  // wsWorker's cache of everything that arrived before the port attached
  | { type: "seed"; data: LiveShredsData };

/** Shreds chart worker -> main thread */
export type FromChartWorker =
  | { type: "ready" }
  // WebGL2 context creation failed in the worker
  | { type: "initFailed" }
  | { type: "contextLost" }
  | { type: "contextRestored" }
  // computed slot label positions for DOM application (labelsApply.ts),
  // plus the leader-group range the DOM label skeleton renders from
  // (main atoms stop carrying it once the main shreds feed is off)
  | {
      type: "labels";
      frame: LabelFrame;
      leaderRange: { min: number; max: number };
    };
