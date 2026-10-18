import { useLayoutEffect, useRef } from "react";

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
import { useWebGlEventHandlers } from "../../../WebGl/useWebGlEventHandlers";

const REDRAW_INTERVAL_MS = 15;

interface ShredsChartProps
  extends WebGlRemountProps,
    Pick<FlexProps, "height" | "minHeight" | "flexGrow"> {
  chartId: string;
}

function ShredsChart({ remount, chartId, ...flexProps }: ShredsChartProps) {
  const setMinDirtySlotByChart = useSetAtom(minDirtySlotByChartAtom);
  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const lastRedrawRef = useRef(-Infinity);
  const [measureRef, { width, height: fullHeight }] =
    useMeasure<HTMLDivElement>();
  const height = fullHeight - xAxisHeight;

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();
  const labelsRef = useRef<{
    prevLabels: LabelsState;
    tempNewLabels: LabelsState;
  }>({
    prevLabels: createLabelsState(),
    tempNewLabels: createLabelsState(),
  });

  const scale = useShredsChartScale();

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

      if (!rendererRef.current) return;

      rendererRef.current.cleanUpRenderer();
      rendererRef.current = undefined;
    };
  }, [chartId, setMinDirtySlotByChart]);

  // handle chart resize
  useLayoutEffect(() => {
    // skip while the context is lost. Remount on restore will handle resizing
    if (!rendererRef.current || getWasContextLost()) return;

    // skip until valid size is initialized
    if (width <= 0 || height <= 0) return;
    const { renderer } = rendererRef.current;
    renderer.setSize(width, height);

    drawLive(
      chartId,
      rendererRef.current,
      labelsRef,
      scale,
      true /* force redraw */,
      [0, width],
    );
  }, [scale, width, height, chartId, getWasContextLost]);

  useRafLoop(function drawShredsLoop(time: number) {
    // Don't draw while waiting for context restore.
    // but keep canvas mounted to listen for restore event.
    if (getWasContextLost()) return;

    // skip until valid size is initialized
    if (width <= 0 || height <= 0) return;

    if (time - lastRedrawRef.current < REDRAW_INTERVAL_MS) {
      return;
    }

    lastRedrawRef.current = time;
    if (rendererRef.current) {
      drawLive(chartId, rendererRef.current, labelsRef, scale, false, [
        0,
        width,
      ]);
      return;
    }

    // set up renderer
    const rendererObj = setUpLiveRenderer(
      width,
      height,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    containerRef.current?.replaceChildren(rendererObj.renderer.domElement);
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
        <Box ref={containerRef} position="relative" style={{ zIndex: 1 }} />
      </Box>
    </Flex>
  );
}

const ShredsChartWithRemount = withWebGlRemount(ShredsChart);
export default ShredsChartWithRemount;
