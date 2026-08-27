import { useEffect, useLayoutEffect, useRef } from "react";
import { useMeasure } from "react-use";
import { Box, Flex } from "@radix-ui/themes";
import type { FlexProps } from "@radix-ui/themes";
import { getDefaultStore } from "jotai";
import ChartWorker from "./chartWorker?worker";
import type { FromChartWorker, ToChartWorker } from "./protocol";
import { useShredsChartScale } from "../../useShredsChartScale";
import ShredsSlotLabels from "../../ShredsSlotLabels";
import { MChartAxesDeferred } from "../ChartAxesDeferred";
import { xAxisHeight } from "../../utils";
import { applyLabelFrame } from "../../labelsApply";
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
 * Spawned at module eval (entry bundle): the ~500KB worker chunk fetch,
 * thread start and three.js eval overlap main-bundle eval and the reveal
 * render instead of starting inside the reveal commit. The canvas
 * transfer still happens at mount; remounts spawn fresh workers.
 */
let prewarmedWorker: Worker | null = null;
try {
  if (isOffscreenChartSupported) prewarmedWorker = new ChartWorker();
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

interface OffscreenShredsChartProps
  extends WebGlRemountProps,
    Pick<FlexProps, "height" | "minHeight" | "flexGrow"> {
  chartId: string;
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

    const sendState = () =>
      post({
        type: "state",
        serverTimeMs: store.get(serverTimeMsAtom),
        showStartup: store.get(showStartupProgressAtom),
        slotCaughtUp: store.get(slotCaughtUpAtom) ?? null,
        disconnected: store.get(socketStateAtom) === SocketState.Disconnected,
      });
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
          applyLabelFrame(msg.frame, prevLabels, tempNewLabels);
          // switch map for reuse, don't create new maps each frame
          labelsRef.current = {
            prevLabels: tempNewLabels,
            tempNewLabels: prevLabels,
          };
          prevLabels.groups.clear();
          prevLabels.slots.clear();
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
    <Flex direction="column" gap="2px" {...flexProps}>
      <ShredsSlotLabels />
      <Box flexGrow="1" minHeight="0" position="relative" ref={measureRef}>
        <MChartAxesDeferred
          chartId={`${chartId}-axes`}
          scale={scale}
          containerWidth={width}
          containerHeight={fullHeight + 1}
        />
        <Box position="relative" style={{ zIndex: 1 }} ref={containerRef} />
      </Box>
    </Flex>
  );
}

const OffscreenShredsChartWithRemount = withWebGlRemount(OffscreenShredsChart);
export default OffscreenShredsChartWithRemount;
