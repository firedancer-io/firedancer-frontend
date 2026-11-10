import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type MouseEvent,
} from "react";

import { useLatest, useMeasure, useRafLoop, useUnmount } from "react-use";
import { useNavigate } from "@tanstack/react-router";
import { Box, Flex } from "@radix-ui/themes";
import type { FlexProps } from "@radix-ui/themes";
import { useShredsChartScale } from "../useShredsChartScale";
import { getDefaultStore, useSetAtom } from "jotai";
import { minDirtySlotByChartAtom } from "../../../Shreds/atoms";
import type { RendererObj } from "../../../Shreds/types";
import { drawLive, renderOverviewHover } from "./utils";
import { setUpLiveRenderer } from "../../../Shreds/WebGl/setupUtils";
import ShredsSlotLabels from "../ShredsSlotLabels";
import { MChartAxes, xAxisHeight } from "./ChartAxes";
import { createLabelsState, getLabelSlotAtX, type LabelsState } from "../utils";
import withWebGlRemount, {
  type WebGlRemountProps,
} from "../../../WebGl/withWebGlRemount";
import { useWebGlRenderer } from "../../../WebGl/useWebGlRenderer";
import {
  canOpenHoveredShredAtom,
  canOpenInReplay,
  overviewHoveredShredAtom,
  labelHoveredSlotAtom,
  overviewHoveredSlotAtom,
} from "../atoms";
import { useReplayTargetClick } from "../../../Replay/useReplayTargetClick";
import { useFrameRender } from "../../../WebGl/useFrameRender";
import { calcAbsoluteNs } from "../../../Replay/utils";
import { useAtomsSubscription } from "../../../../atomUtils";
import {
  getShredsState,
  getVisibleTsRange,
  isShredsPausedAtom,
  pauseShredsAtom,
  resumeShredsAtom,
} from "../pauseAtoms";
import { getShredAtPosition } from "../../../Shreds/WebGl/shredHover";
import type { DrawableSlot } from "../../../Shreds/chartUtils";
import {
  useHoveredPosition,
  type HoveredRect,
} from "../../../Replay/useHoveredPosition";
import { clientXToTs, clientYToWorldY } from "../../../Replay/hoverUtils";
import { useThrottledCallbackIfVisible } from "../../../../api/useDebounceIfVisible";
import styles from "../shreds.module.css";

const store = getDefaultStore();

const REDRAW_INTERVAL_MS = 15;

const getOverviewDrawSlotKey = (drawSlot: DrawableSlot) =>
  String(drawSlot.slotNumber);

const getHoveredShredSlot = () => store.get(overviewHoveredShredAtom)?.slot;

interface ShredsChartProps
  extends WebGlRemountProps,
    Pick<FlexProps, "height" | "minHeight" | "flexGrow"> {
  chartId: string;
}

function ShredsChart({ remount, chartId, ...flexProps }: ShredsChartProps) {
  const setMinDirtySlotByChart = useSetAtom(minDirtySlotByChartAtom);
  const lastRedrawRef = useRef(-Infinity);
  const [measureRef, { width, height: fullHeight }] =
    useMeasure<HTMLDivElement>();
  const height = fullHeight - xAxisHeight;

  const { containerRef, rendererRef, getWasContextLost } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpLiveRenderer(setUpContextListeners, getWasContextLost),
    onResize: (rendererObj) => drawForced(rendererObj),
  });
  const labelsRef = useRef<{
    prevLabels: LabelsState;
    tempNewLabels: LabelsState;
  }>({
    prevLabels: createLabelsState(),
    tempNewLabels: createLabelsState(),
  });

  const scale = useShredsChartScale();

  const drawForced = useCallback(
    (rendererObj: RendererObj) => {
      const { renderer } = rendererObj;
      const { width: bufferWidth, height: bufferHeight } = renderer.domElement;
      if (getWasContextLost() || !bufferWidth || !bufferHeight) return;
      // Read from the canvas, which is already resized when the observer calls this
      const cssWidth = bufferWidth / renderer.getPixelRatio();
      drawLive(
        chartId,
        rendererObj,
        labelsRef,
        scale,
        true /* force redraw */,
        [0, cssWidth],
      );
    },
    [chartId, scale, getWasContextLost],
  );

  const scaleRef = useLatest(scale);

  const hitTest = useCallback(
    (clientX: number, clientY: number, rect: HoveredRect) => {
      const renderer = rendererRef.current;
      const state = getShredsState(store.get);
      if (!renderer?.lastDrawInfo || !state) return;

      const visibleRange = getVisibleTsRange(state, scaleRef.current);
      const ts = clientXToTs(rect, clientX, visibleRange);
      const { top, bottom } = renderer.camera;
      const worldY = clientYToWorldY(rect, clientY, top, bottom);
      return getShredAtPosition(
        ts,
        worldY,
        renderer.lastDrawInfo,
        getOverviewDrawSlotKey,
      );
    },
    [rendererRef, scaleRef],
  );

  // Replay centered on the ts under clientX
  const getReplayTarget = useCallback(
    (
      slot: number,
      clientX: number,
      rect = containerRef.current?.getBoundingClientRect(),
    ) => {
      const state = getShredsState(store.get);
      if (!rect || !state || !canOpenInReplay(store.get, slot)) return;

      const visibleRange = getVisibleTsRange(state, scaleRef.current);
      const ts = clientXToTs(rect, clientX, visibleRange);
      return {
        slot,
        centerNs: calcAbsoluteNs(state.liveShreds.referenceTs, ts),
      };
    },
    [containerRef, scaleRef],
  );

  const throttledHover = useThrottledCallbackIfVisible(
    (clientX: number, clientY: number, rect: HoveredRect) =>
      store.set(overviewHoveredShredAtom, hitTest(clientX, clientY, rect)),
    30,
  );

  const clearHover = useCallback(() => {
    throttledHover.cancel();
    store.set(overviewHoveredShredAtom, undefined);
  }, [throttledHover]);

  const { setContainer: setHoverContainer, notifyChange: notifyHover } =
    useHoveredPosition({
      onHoverChange: throttledHover,
      onHoverLeave: clearHover,
      followsVisibleRange: false,
    });

  const setContainer = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el;
      setHoverContainer(el);
    },
    [containerRef, setHoverContainer],
  );

  // label positions are cached from the last draw, so hover reads no layout
  const { setContainer: setLabelsContainer, notifyChange: notifyLabelsHover } =
    useHoveredPosition({
      onHoverChange: (clientX, _clientY, rect) =>
        store.set(
          labelHoveredSlotAtom,
          getLabelSlotAtX(labelsRef.current.prevLabels, clientX - rect.left),
        ),
      onHoverLeave: () => store.set(labelHoveredSlotAtom, undefined),
      followsVisibleRange: false,
    });

  const navigate = useNavigate();
  const { onPointerDown, onClick } = useReplayTargetClick(
    useCallback(
      (e: MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const hovered = hitTest(e.clientX, e.clientY, rect);
        return hovered && getReplayTarget(hovered.slot, e.clientX, rect);
      },
      [hitTest, getReplayTarget],
    ),
    getHoveredShredSlot,
  );

  // like Replay's shreds track, hover only repaints the highlight
  const requestHoverRender = useFrameRender(() => {
    if (rendererRef.current) {
      renderOverviewHover(rendererRef.current, scaleRef.current);
    }
  });
  useAtomsSubscription(
    [overviewHoveredShredAtom, overviewHoveredSlotAtom],
    requestHoverRender,
  );

  // paused frames only redraw here
  useAtomsSubscription([isShredsPausedAtom], () => {
    if (rendererRef.current) drawForced(rendererRef.current);
    // like Replay after a draw, re-resolve a still cursor against what's drawn
    notifyHover();
    notifyLabelsHover();
  });

  useAtomsSubscription([canOpenHoveredShredAtom], () => {
    containerRef.current?.classList.toggle(
      styles.shredPointer,
      store.get(canOpenHoveredShredAtom),
    );
  });

  // Touch has no hover: a tap's preview stays paused until a touch outside
  // clears it, so the confirming tap hits the previewed slot
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onWindowTouchDown = (e: PointerEvent) => {
      if (
        e.pointerType !== "mouse" &&
        !chartRef.current?.contains(e.target as Node)
      ) {
        store.set(resumeShredsAtom);
      }
    };
    window.addEventListener("pointerdown", onWindowTouchDown);
    return () => window.removeEventListener("pointerdown", onWindowTouchDown);
  }, []);

  useUnmount(() => {
    clearHover();
    store.set(labelHoveredSlotAtom, undefined);
    store.set(resumeShredsAtom);
  });

  useLayoutEffect(() => {
    // setup dirty slot tracking
    setMinDirtySlotByChart((prev) => {
      // trigger draw of every slot
      prev.set(chartId, -Infinity);
      return prev;
    });

    return () => {
      setMinDirtySlotByChart((prev) => {
        prev.delete(chartId);
        return prev;
      });
    };
  }, [chartId, setMinDirtySlotByChart]);

  useLayoutEffect(() => {
    if (rendererRef.current) drawForced(rendererRef.current);
  }, [drawForced, rendererRef]);

  useRafLoop(function drawShredsLoop(time: number) {
    // Don't draw while waiting for context restore.
    // but keep canvas mounted to listen for restore event.
    if (getWasContextLost()) return;

    // skip until valid size is initialized
    if (!rendererRef.current || width <= 0 || height <= 0) return;

    if (time - lastRedrawRef.current < REDRAW_INTERVAL_MS) {
      return;
    }

    lastRedrawRef.current = time;
    drawLive(chartId, rendererRef.current, labelsRef, scale, false, [0, width]);
  });

  return (
    <Flex
      direction="column"
      gap="2px"
      ref={chartRef}
      // pause the chart and its labels while hovered, once there's data
      onPointerEnter={() => store.set(pauseShredsAtom)}
      onPointerMove={() => store.set(pauseShredsAtom)}
      onPointerLeave={(e) => {
        // a lifted finger leaves, but keeps any preview it tapped
        if (
          e.pointerType === "mouse" ||
          store.get(overviewHoveredSlotAtom) == null
        ) {
          store.set(resumeShredsAtom);
        }
      }}
      {...flexProps}
    >
      <ShredsSlotLabels
        setContainer={setLabelsContainer}
        getReplayTarget={getReplayTarget}
      />
      <Box flexGrow="1" minHeight="0" position="relative" ref={measureRef}>
        <MChartAxes
          chartId={`${chartId}-axes`}
          scale={scale}
          containerWidth={width}
          containerHeight={fullHeight + 1}
        />
        <Box
          ref={setContainer}
          onPointerDown={onPointerDown}
          onClick={(e) => {
            if (onClick(e)) void navigate({ to: "/replay" });
          }}
          position="relative"
          height={`${Math.max(height, 0)}px`}
          style={{ zIndex: 1 }}
        />
      </Box>
    </Flex>
  );
}

const ShredsChartWithRemount = withWebGlRemount(ShredsChart);
export default ShredsChartWithRemount;
