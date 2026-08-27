import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { useMeasure } from "react-use";
import clsx from "clsx";
import { getDefaultStore } from "jotai";
import ChartWorker from "./chartWorker?worker";
import type { FromChartWorker, ToChartWorker } from "./protocol";
import { useShredsChartScale } from "../../useShredsChartScale";
import ShredsSlotLabels from "../../ShredsSlotLabels";
import { MChartAxesDeferred } from "../ChartAxesDeferred";
import { xAxisHeight } from "../../utils";
import { applyLabelFrame } from "../../labelsApply";
import { createLabelScheduler } from "./labelScheduler";
import { createLabelsState } from "../../utils";
import { offscreenLeaderSlotsRangeAtom } from "../../atoms";
import {
  serverTimeMsAtom,
  skippedClusterSlotsAtom,
} from "../../../../../atoms";
import { slotCaughtUpAtom } from "../../../../../api/atoms";
import { socketStateAtom } from "../../../../../api/ws/atoms";
import { SocketState } from "../../../../../api/ws/types";
import { showStartupProgressAtom } from "../../../../StartupProgress/atoms";
import { openShredsChartPort } from "../../../../../api/worker/useWsWorker";
import {
  isOffscreenChartSupported,
  isWebgl2SupportedAtom,
  offscreenChartFailedAtom,
} from "../../../../WebGl/atoms";
import withWebGlRemount, {
  type WebGlRemountProps,
} from "../../../../WebGl/withWebGlRemount";
import { MAX_WEBGL_PX_RATIO } from "../../../../../consts";

const store = getDefaultStore();

/**
 * Handle to the chart worker when the index.html inline script (build
 * only) had the early blob worker spawn it NESTED, so its fetch, thread
 * start and three.js eval never queue behind main-thread bundle work.
 * Mirrors earlyWs.ts's MainWs.
 */
interface ParkedChartWorker {
  port: MessagePort;
  early: Worker;
  error: boolean;
  pending: MessageEvent[];
}

declare global {
  interface Window {
    __fdChartMain?: ParkedChartWorker;
  }
}

/**
 * Worker facade over the main-thread port to the nested chart worker.
 * terminate() must NOT terminate the blob worker (it owns wsWorker and
 * the socket); the kill is relayed for the blob worker to terminate
 * just its nested chart child.
 */
function attachNestedChartWorker(): Worker | null {
  const main = window.__fdChartMain;
  if (!main) return null;
  delete window.__fdChartMain; // attach is first-mount-only
  if (main.error) {
    main.port.close();
    return null;
  }
  const { port, early, pending } = main;
  return {
    postMessage: (msg: unknown, transfer?: Transferable[]) =>
      port.postMessage(msg, transfer ?? []),
    set onmessage(fn: ((e: MessageEvent) => void) | null) {
      port.onmessage = fn;
      if (fn) for (const ev of pending.splice(0)) fn(ev);
    },
    terminate: () => {
      port.close();
      early.postMessage("kill-chart");
    },
  } as unknown as Worker;
}

/**
 * Spawned at module eval (entry bundle): the ~500KB worker chunk fetch,
 * thread start and three.js eval overlap main-bundle eval and the reveal
 * render instead of starting inside the reveal commit. The nested-spawn
 * handle from the inline script is preferred (it started at page load);
 * page spawn is the fallback. The canvas transfer still happens at
 * mount; remounts spawn fresh (page) workers.
 */
let prewarmedWorker: Worker | null = null;
try {
  if (isOffscreenChartSupported)
    prewarmedWorker = attachNestedChartWorker() ?? new ChartWorker();
} catch {
  prewarmedWorker = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    prewarmedWorker?.terminate();
    prewarmedWorker = null;
  });
}

/**
 * How long to wait for a lost worker-side WebGL context to be restored
 * before falling back to the main-thread charts.
 */
const CONTEXT_RESTORE_TIMEOUT_MS = 10_000;

interface OffscreenShredsChartProps extends WebGlRemountProps {
  chartId: string;
  height?: string;
  minHeight?: string;
  flexGrow?: "0" | "1";
}

/**
 * Shreds chart rendered in a worker via OffscreenCanvas (chartWorker.ts):
 * three.js never loads on the main thread. The main thread keeps only the
 * DOM shell (slot labels, uplot axes) and forwards dimensions and low-rate
 * state; shred events flow worker-to-worker from wsWorker.
 */
function OffscreenShredsChart({
  remount,
  chartId,
  ...flexProps
}: OffscreenShredsChartProps) {
  const scale = useShredsChartScale();
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const [measureRef, { width, height: fullHeight }] =
    useMeasure<HTMLDivElement>();
  const height = fullHeight - xAxisHeight;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const sizeRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  sizeRef.current = { width, height };
  const labelsRef = useRef({
    prevLabels: createLabelsState(),
    tempNewLabels: createLabelsState(),
  });
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // one worker + canvas transfer per mount; context restore remounts.
  // The canvas is created here (not in JSX) so every effect run gets a
  // fresh, untransferred element.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // useMeasure's first ResizeObserver pass can land >1s after mount under
    // load; measure synchronously so the first worker frame is full-size
    const rect = container.parentElement?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > xAxisHeight) {
      sizeRef.current = {
        width: rect.width,
        height: rect.height - xAxisHeight,
      };
    }

    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = `${Math.max(sizeRef.current.height, 0)}px`;
    container.replaceChildren(canvas);
    canvasRef.current = canvas;

    let offscreen: OffscreenCanvas;
    try {
      offscreen = canvas.transferControlToOffscreen();
    } catch {
      // canvas already transferred or transfer unsupported at runtime
      store.set(offscreenChartFailedAtom, true);
      prewarmedWorker?.terminate();
      prewarmedWorker = null;
      return;
    }

    const worker = prewarmedWorker ?? new ChartWorker();
    prewarmedWorker = null;
    workerRef.current = worker;
    const post = (msg: ToChartWorker, transfer?: Transferable[]) =>
      worker.postMessage(msg, transfer ?? []);
    post(
      {
        type: "init",
        canvas: offscreen,
        pixelRatio: Math.min(window.devicePixelRatio, MAX_WEBGL_PX_RATIO),
        scale: scaleRef.current,
      },
      [offscreen],
    );
    const { width: w, height: h } = sizeRef.current;
    if (w > 0 && h > 0) post({ type: "resize", width: w, height: h });

    // shred events flow wsWorker -> chart worker, bypassing this thread
    const port = openShredsChartPort();
    if (port) post({ type: "shredsPort", port }, [port]);

    // rAF-coalesced label application: frames arrive per worker timer
    // tick, not per display frame -- latest frame wins, stale ones drop,
    // the DOM writes land frame-aligned, and slow draws are extrapolated
    // between frames (labelScheduler.ts)
    const scheduler = createLabelScheduler<
      Extract<FromChartWorker, { type: "labels" }>
    >((frame, msg) => {
      // feed the DOM label skeleton's range (equality-guarded: the
      // frames arrive per draw tick, the range changes per leader)
      const prevRange = store.get(offscreenLeaderSlotsRangeAtom);
      if (
        prevRange?.min !== msg.leaderRange.min ||
        prevRange?.max !== msg.leaderRange.max
      ) {
        store.set(offscreenLeaderSlotsRangeAtom, msg.leaderRange);
      }
      const { prevLabels, tempNewLabels } = labelsRef.current;
      applyLabelFrame(frame, prevLabels, tempNewLabels);
      // switch map for reuse, don't create new maps each frame
      labelsRef.current = {
        prevLabels: tempNewLabels,
        tempNewLabels: prevLabels,
      };
      prevLabels.groups.clear();
      prevLabels.slots.clear();
    });

    const sendState = () => {
      const showStartup = store.get(showStartupProgressAtom);
      const disconnected =
        store.get(socketStateAtom) === SocketState.Disconnected;
      // frames stop while the draw gates are closed; freeze in place
      if (showStartup || disconnected) scheduler.park();
      post({
        type: "state",
        serverTimeMs: store.get(serverTimeMsAtom),
        showStartup,
        slotCaughtUp: store.get(slotCaughtUpAtom) ?? null,
        disconnected,
      });
    };
    const sendSkipped = () =>
      post({
        type: "skipped",
        slots: [...store.get(skippedClusterSlotsAtom)],
      });

    const unsubs = [
      store.sub(serverTimeMsAtom, sendState),
      store.sub(showStartupProgressAtom, sendState),
      store.sub(slotCaughtUpAtom, sendState),
      store.sub(socketStateAtom, sendState),
      store.sub(skippedClusterSlotsAtom, sendSkipped),
    ];
    sendState();
    sendSkipped();

    worker.onmessage = (e: MessageEvent<FromChartWorker>) => {
      const msg = e.data;
      switch (msg.type) {
        case "labels": {
          scheduler.push(msg);
          break;
        }
        case "initFailed":
          store.set(offscreenChartFailedAtom, true);
          break;
        case "contextLost":
          // hide to avoid showing a stale frame while drawing is paused
          canvas.style.visibility = "hidden";
          restoreTimerRef.current ??= setTimeout(() => {
            store.set(isWebgl2SupportedAtom, false);
            store.set(offscreenChartFailedAtom, true);
          }, CONTEXT_RESTORE_TIMEOUT_MS);
          break;
        case "contextRestored":
          clearTimeout(restoreTimerRef.current);
          restoreTimerRef.current = undefined;
          remount();
          break;
        case "ready":
          break;
      }
    };

    return () => {
      for (const unsub of unsubs) unsub();
      scheduler.stop();
      clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = undefined;
      port?.close();
      worker.terminate();
      workerRef.current = null;
      canvas.remove();
      canvasRef.current = null;
      // fallback charts derive the label range from the main atoms
      store.set(offscreenLeaderSlotsRangeAtom, undefined);
    };
  }, [remount]);

  useEffect(() => {
    workerRef.current?.postMessage({
      type: "scale",
      scale,
    } satisfies ToChartWorker);
  }, [scale]);

  useLayoutEffect(() => {
    if (width <= 0 || height <= 0) return;
    if (canvasRef.current) canvasRef.current.style.height = `${height}px`;
    workerRef.current?.postMessage({
      type: "resize",
      width,
      height,
    } satisfies ToChartWorker);
  }, [width, height]);

  return (
    <div
      className={clsx(
        "rt-Flex rt-r-fd-column rt-r-gap",
        flexProps.height !== undefined && "rt-r-h",
        flexProps.minHeight !== undefined && "rt-r-min-h",
        flexProps.flexGrow !== undefined && `rt-r-fg-${flexProps.flexGrow}`,
      )}
      style={
        {
          "--gap": "2px",
          "--height": flexProps.height,
          "--min-height": flexProps.minHeight,
        } as CSSProperties
      }
    >
      <ShredsSlotLabels />
      <div
        className="rt-Box rt-r-min-h rt-r-position-relative rt-r-fg-1"
        style={{ "--min-height": "0" } as CSSProperties}
        ref={measureRef}
      >
        <MChartAxesDeferred
          chartId={`${chartId}-axes`}
          scale={scale}
          containerWidth={width}
          containerHeight={fullHeight + 1}
        />
        <div
          className="rt-Box rt-r-position-relative"
          style={{ zIndex: 1 }}
          ref={containerRef}
        />
      </div>
    </div>
  );
}

const OffscreenShredsChartWithRemount = withWebGlRemount(OffscreenShredsChart);
export default OffscreenShredsChartWithRemount;
