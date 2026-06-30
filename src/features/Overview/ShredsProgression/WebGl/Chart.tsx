import { useLayoutEffect, useRef } from "react";

import { useMeasure, useRafLoop } from "react-use";
import { Box, Flex } from "@radix-ui/themes";
import type { FlexProps } from "@radix-ui/themes";
import { useShredsChartScale } from "../useShredsChartScale";
import { useSetAtom } from "jotai";
import { minDirtySlotByChartAtom } from "../atoms";
import type { RendererObj, TsRange } from "./chartUtils";
import { setUpRenderer, draw } from "./chartUtils";
import ShredsSlotLabels from "../ShredsSlotLabels";
import { MChartAxes, xAxisHeight } from "./ChartAxes";
import { createLabelsState, type LabelsState } from "../utils";

const REDRAW_INTERVAL_MS = 15;

type FlexPropsSubset = Pick<FlexProps, "height" | "minHeight" | "flexGrow">;

interface ShredsChartProps {
  chartId: string;
}
export default function ShredsChart({
  chartId,
  ...flexProps
}: ShredsChartProps & FlexPropsSubset) {
  const setMinDirtySlotByChart = useSetAtom(minDirtySlotByChartAtom);

  const prevTimeDiffsRef = useRef<number[]>([]);
  const lastRedrawRef = useRef(0);
  const [measureRef, { width, height: fullHeight }] =
    useMeasure<HTMLDivElement>();
  const height = fullHeight - xAxisHeight;

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();
  const visibleTsRangeRef = useRef<TsRange | undefined>();
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

      // dispose of WebGL resources
      // NOTE: keep sharedMaterial and unitQuad to be reused across mounts
      const obj = rendererRef.current;
      if (!obj) return;

      for (const slotMesh of obj.meshes.values()) {
        slotMesh.mesh.geometry.dispose();
      }
      for (const slotMesh of obj.availableMeshes) {
        slotMesh.mesh.geometry.dispose();
      }
      obj.renderer.dispose();
      // force release of GL context on repeated mount / unmounts
      obj.renderer.forceContextLoss();
      obj.renderer.domElement.remove();
      rendererRef.current = undefined;
    };
  }, [chartId, setMinDirtySlotByChart]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    const { renderer } = rendererRef.current;
    renderer.setSize(width, height);
    draw(
      chartId,
      prevTimeDiffsRef,
      rendererRef.current,
      visibleTsRangeRef,
      labelsRef,
      scale,
      true /* force redraw */,
      [0, width],
    );
  }, [scale, width, height, chartId]);

  useRafLoop(function drawShredsLoop(time: number) {
    if (
      lastRedrawRef.current == null ||
      time - lastRedrawRef.current >= REDRAW_INTERVAL_MS
    ) {
      lastRedrawRef.current = time;
      if (!rendererRef.current) {
        const rendererObj = setUpRenderer(width, height);
        if (!rendererObj) return;

        rendererRef.current = rendererObj;
        containerRef.current?.replaceChildren(rendererObj.renderer.domElement);
      } else {
        draw(
          chartId,
          prevTimeDiffsRef,
          rendererRef.current,
          visibleTsRangeRef,
          labelsRef,
          scale,
          false,
          [0, width],
        );
      }
    }
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
