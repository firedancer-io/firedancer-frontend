import { useCallback, useLayoutEffect, useRef } from "react";

import { useMeasure, useRafLoop } from "react-use";
import { Box, Flex } from "@radix-ui/themes";
import type { FlexProps } from "@radix-ui/themes";
import { useShredsChartScale } from "../useShredsChartScale";
import { useSetAtom } from "jotai";
import { minDirtySlotByChartAtom } from "../../../Shreds/atoms";
import type { RendererObj } from "../../../Shreds/types";
import { drawLive } from "./utils";
import { setUpLiveRenderer } from "../../../Shreds/WebGl/setupUtils";
import ShredsSlotLabels from "../ShredsSlotLabels";
import { MChartAxes, xAxisHeight } from "./ChartAxes";
import { createLabelsState, type LabelsState } from "../utils";
import withWebGlRemount, {
  type WebGlRemountProps,
} from "../../../WebGl/withWebGlRemount";
import { useWebGlRenderer } from "../../../WebGl/useWebGlRenderer";

const REDRAW_INTERVAL_MS = 15;

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
    <Flex direction="column" gap="2px" {...flexProps}>
      <ShredsSlotLabels />
      <Box flexGrow="1" minHeight="0" position="relative" ref={measureRef}>
        <MChartAxes
          chartId={`${chartId}-axes`}
          scale={scale}
          containerWidth={width}
          containerHeight={fullHeight + 1}
        />
        <Box
          ref={containerRef}
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
