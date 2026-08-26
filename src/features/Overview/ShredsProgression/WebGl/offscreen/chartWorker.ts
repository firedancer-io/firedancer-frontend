import { OrthographicCamera, Scene, WebGLRenderer } from "three";
import { createShredsCalc } from "../../../../../api/worker/cache/shreds/shredsCalc";
import { nsPerMs } from "../../../../../consts";
import { getSlotGroupLeader } from "../../../../../utils";
import { createWebglResources } from "../../../../WebGl/webglUtils";
import { computeLabelFrame } from "../../labelsCalc";
import { drawScene, type SceneObjects, type TsRange } from "../drawCore";
import type { LiveShreds } from "../../../../../api/types";
import type {
  FromChartWorker,
  ShredsPortMessage,
  ToChartWorker,
} from "./protocol";

/**
 * OffscreenCanvas shreds chart worker: owns the three.js renderer and the
 * full draw loop, so neither the ~500KB three.js chunk eval nor the
 * per-frame mesh/render work touches the main thread. Shred events arrive
 * directly from wsWorker over a MessagePort; the main thread only sends
 * dimensions and low-rate state, and receives label positions back.
 */

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (msg: FromChartWorker) => ctx.postMessage(msg);

const REDRAW_INTERVAL_MS = 15;

// state fed by messages
let width = 0;
let height = 0;
let pixelRatio = 1;
let scale = 1;
let serverTimeMs: number | undefined;
let showStartup = false;
let slotCaughtUp: number | null = null;
let skippedSlots = new Set<number>();
let minDirtySlot = -Infinity;
let forceDraw = false;

const shredsCalc = createShredsCalc(() => ({
  serverTimeNanos: serverTimeMs == null ? undefined : serverTimeMs * nsPerMs,
  isStartup: showStartup,
}));

// renderer
let objs: SceneObjects | null = null;
let contextLost = false;
const prevTimeDiffs: number[] = [];
const visibleTsRangeRef: { current: TsRange | undefined } = {
  current: undefined,
};
let lastRedraw = -Infinity;

function initRenderer(canvas: OffscreenCanvas) {
  try {
    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);

    const scene = new Scene();
    const camera = new OrthographicCamera(0, 0, 0, 0, 0.5, 10);
    camera.position.z = 1;

    objs = {
      renderer,
      camera,
      scene,
      meshes: new Map(),
      availableMeshes: [],
      resources: createWebglResources(),
    };

    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      contextLost = true;
      post({ type: "contextLost" });
    });
    canvas.addEventListener("webglcontextrestored", () => {
      // main remounts with a fresh canvas + worker
      post({ type: "contextRestored" });
    });

    post({ type: "ready" });
  } catch {
    post({ type: "initFailed" });
  }
}

function getRangeAfterStartup(range: { min: number; max: number }) {
  if (slotCaughtUp == null) return;

  // no slots after startup
  if (slotCaughtUp + 1 > range.max) return;

  return {
    min: Math.max(slotCaughtUp + 1, range.min),
    max: range.max,
  };
}

function addShreds(value: LiveShreds) {
  shredsCalc.add(value);
  for (const delta of value.slot_delta) {
    const slotNumber = value.reference_slot + delta;
    if (slotNumber < minDirtySlot) minDirtySlot = slotNumber;
  }
}

// rAF is available in workers on Chrome/Firefox/Safari 15.4+; keep a
// timer fallback so older engines still draw
const scheduleFrame: (cb: (time: number) => void) => void =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16);

function tick(time: number) {
  scheduleFrame(tick);

  if (!objs || contextLost) return;
  if (width <= 0 || height <= 0) return;
  if (time - lastRedraw < REDRAW_INTERVAL_MS) return;
  lastRedraw = time;

  const {
    slotsShreds: liveShreds,
    range: slotRange,
    minCompletedSlot,
  } = shredsCalc.data;

  // mirror the main-thread chart gates (chartUtils.draw)
  if (
    !liveShreds ||
    !slotRange ||
    showStartup ||
    minCompletedSlot == null ||
    serverTimeMs == null
  )
    return;

  const rangeAfterStartup = getRangeAfterStartup(slotRange);
  if (!rangeAfterStartup) return;

  const xRange = drawScene(objs, prevTimeDiffs, visibleTsRangeRef, {
    liveShreds,
    slotRange,
    minCompletedSlot,
    skippedSlotsCluster: skippedSlots,
    serverTimeMs,
    scale,
    minDirtySlot,
    cssRange: [0, width],
    forceDraw,
  });
  forceDraw = false;
  minDirtySlot = Infinity;

  const leaderRange = {
    min: getSlotGroupLeader(rangeAfterStartup.min),
    max: getSlotGroupLeader(rangeAfterStartup.max),
  };
  const frame = computeLabelFrame(
    rangeAfterStartup,
    leaderRange,
    liveShreds.slots,
    skippedSlots,
    xRange,
  );
  post({ type: "labels", frame, leaderRange });
}

scheduleFrame(tick);

ctx.onmessage = (e: MessageEvent<ToChartWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case "init":
      pixelRatio = msg.pixelRatio;
      scale = msg.scale;
      initRenderer(msg.canvas);
      break;
    case "resize":
      width = msg.width;
      height = msg.height;
      if (objs && !contextLost) {
        objs.renderer.setSize(width, height, false);
        forceDraw = true;
        minDirtySlot = -Infinity;
      }
      break;
    case "scale":
      scale = msg.scale;
      break;
    case "state":
      serverTimeMs = msg.serverTimeMs;
      showStartup = msg.showStartup;
      slotCaughtUp = msg.slotCaughtUp;
      if (msg.disconnected) {
        shredsCalc.resetDataAndClearDeleteTimeout();
      }
      break;
    case "skipped": {
      const next = new Set(msg.slots);
      // redraw every slot whose skipped state changed
      for (const slot of next) {
        if (!skippedSlots.has(slot) && slot < minDirtySlot) minDirtySlot = slot;
      }
      for (const slot of skippedSlots) {
        if (!next.has(slot) && slot < minDirtySlot) minDirtySlot = slot;
      }
      skippedSlots = next;
      break;
    }
    case "shredsPort":
      msg.port.onmessage = (pe: MessageEvent<ShredsPortMessage>) => {
        const pm = pe.data;
        if (pm.type === "seed") {
          // pre-attach backlog from wsWorker's cache
          shredsCalc.seed(pm.data);
          minDirtySlot = -Infinity;
          forceDraw = true;
        } else {
          addShreds(pm.value);
        }
      };
      break;
  }
};
