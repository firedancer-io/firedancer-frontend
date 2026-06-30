import { useEffect, useLayoutEffect, useRef } from "react";

import { useMeasure, useRafLoop } from "react-use";
import { Box, Flex } from "@radix-ui/themes";
import type { FlexProps } from "@radix-ui/themes";
import { useShredsChartScale } from "../useShredsChartScale";
import { getDefaultStore, useAtomValue } from "jotai";
import { serverTimeMsAtom } from "../../../../atoms";
import { minDirtySlotByChartAtom } from "../atoms";
import type {} from "../../../../api/worker/cache/shreds/types";
import type { RendererObj, TsRange, LabelsState } from "./chartUtils";
import { setUpRenderer, draw, createLabelsState } from "./chartUtils";
import ShredsSlotLabels from "../ShredsSlotLabels";

const store = getDefaultStore();

const REDRAW_INTERVAL_MS = 15;

type FlexPropsSubset = Pick<FlexProps, "height" | "minHeight" | "flexGrow">;

interface ShredsChartProps {
  chartId: string;
  isOnStartupScreen: boolean;
}
export default function ShredsChart({
  chartId,
  isOnStartupScreen,
  ...flexProps
}: ShredsChartProps & FlexPropsSubset) {
  const serverTimeNs = useAtomValue(serverTimeMsAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const scale = useShredsChartScale();

  useEffect(() => {
    store.set(minDirtySlotByChartAtom, (prev) => {
      prev.set(chartId, null);
      return prev;
    });
    return () => {
      store.set(minDirtySlotByChartAtom, (prev) => {
        prev.delete(chartId);
        return prev;
      });
    };
  }, [chartId]);

  const rendererRef = useRef<RendererObj | undefined>();
  const visibleTsRangeRef = useRef<TsRange | undefined>();
  const labelsRef = useRef<{
    prevLabels: LabelsState;
    tempNewLabels: LabelsState;
  }>({
    prevLabels: createLabelsState(),
    tempNewLabels: createLabelsState(),
  });

  const lastRedrawRef = useRef(0);
  const lastRedrawServerTimeNsRef = useRef(serverTimeNs);
  const [measureRef, { width, height }] = useMeasure<HTMLDivElement>();
  const prevTimeDiffsRef = useRef<number[]>([]);

  useRafLoop(function drawShredsLoop(time: number) {
    if (
      lastRedrawRef.current == null ||
      time - lastRedrawRef.current >= REDRAW_INTERVAL_MS
      //   &&
      // lastRedrawServerTimeNsRef.current !== serverTimeNs
    ) {
      lastRedrawRef.current = time;
      if (!rendererRef.current) {
        const result = setUpRenderer(isOnStartupScreen, width, height);
        if (!result) return;
        rendererRef.current = result;
        containerRef.current?.replaceChildren(result.renderer.domElement);
      } else {
        draw(
          chartId,
          isOnStartupScreen,
          prevTimeDiffsRef,
          rendererRef.current,
          visibleTsRangeRef,
          labelsRef,
          scale,
          false,
          width,
        );
      }
    }
  });

  // handle chart resize
  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    const { renderer } = rendererRef.current;
    renderer.setSize(width, height);
    draw(
      chartId,
      isOnStartupScreen,
      prevTimeDiffsRef,
      rendererRef.current,
      visibleTsRangeRef,
      labelsRef,
      scale,
      true /* force redraw */,
      width,
    );
  }, [scale, width, height, chartId, isOnStartupScreen]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    const { renderer } = rendererRef.current;
    renderer.setSize(width, height);
    draw(
      chartId,
      isOnStartupScreen,
      prevTimeDiffsRef,
      rendererRef.current,
      visibleTsRangeRef,
      labelsRef,
      scale,
      true /* force redraw */,
      width,
    );
  }, [scale, width, height, chartId, isOnStartupScreen]);

  return (
    <Flex direction="column" gap="2px" {...flexProps}>
      {!isOnStartupScreen && <ShredsSlotLabels />}
      <Box
        flexGrow="1"
        minHeight="0"
        // mx={`-${chartXPadding}px`}
        ref={measureRef}
      >
        <Box ref={containerRef} />
      </Box>
    </Flex>
  );
}
