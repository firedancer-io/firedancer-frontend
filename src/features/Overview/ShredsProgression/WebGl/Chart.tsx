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
import { disposeWebglResources } from "../../../WebGl/webglUtils";
import WebGlEventHandler, {
  type WebGlEventHandlerChildProps,
} from "../../../WebGl/WebGlEventHandler";

const REDRAW_INTERVAL_MS = 15;

interface ShredsChartProps
  extends Pick<FlexProps, "height" | "minHeight" | "flexGrow"> {
  chartId: string;
}
export default function ShredsChart(props: ShredsChartProps) {
  return (
    <WebGlEventHandler>
      {({
        setUpCanvasListeners,
        resetContextStateAndListeners,
        getIsContextLost,
      }) => (
        <ShredsChartBody
          {...props}
          setUpCanvasListeners={setUpCanvasListeners}
          resetContextStateAndListeners={resetContextStateAndListeners}
          getIsContextLost={getIsContextLost}
        />
      )}
    </WebGlEventHandler>
  );
}

function ShredsChartBody({
  chartId,
  setUpCanvasListeners,
  resetContextStateAndListeners,
  getIsContextLost,
  ...flexProps
}: ShredsChartProps & WebGlEventHandlerChildProps) {
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

      const obj = rendererRef.current;
      if (!obj) return;

      // When the context is lost, its GPU objects are already gone so skip GL cleanup
      if (!getIsContextLost()) {
        for (const slotMesh of obj.meshes.values()) {
          slotMesh.mesh.geometry.dispose();
        }
        for (const slotMesh of obj.availableMeshes) {
          slotMesh.mesh.geometry.dispose();
        }
        // dispose this chart's own unitQuad / sharedMaterial
        disposeWebglResources(obj.resources);

        obj.renderer.dispose();
        // force release of GL context on repeated mount / unmounts.
        // remove listener for context loss beforehand
        resetContextStateAndListeners();
        obj.renderer.forceContextLoss();
      } else {
        resetContextStateAndListeners();
      }
      rendererRef.current = undefined;
    };
  }, [
    chartId,
    resetContextStateAndListeners,
    getIsContextLost,
    setMinDirtySlotByChart,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    // skip while the context is lost. Remount on restore will handle resizing
    if (!rendererRef.current || getIsContextLost()) return;

    // skip until valid size is initialized
    if (width <= 0 || height <= 0) return;
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
  }, [scale, width, height, chartId, getIsContextLost]);

  useRafLoop(function drawShredsLoop(time: number) {
    // Don't draw while waiting for context restore.
    // but keep canvas mounted to listen for restore event.
    if (getIsContextLost()) return;

    // skip until valid size is initialized
    if (width <= 0 || height <= 0) return;

    if (
      lastRedrawRef.current != null &&
      time - lastRedrawRef.current < REDRAW_INTERVAL_MS
    ) {
      return;
    }

    lastRedrawRef.current = time;
    if (rendererRef.current) {
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
      return;
    }

    // set up renderer
    const rendererObj = setUpRenderer(width, height);
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    const canvas = rendererObj.renderer.domElement;
    setUpCanvasListeners(canvas);
    containerRef.current?.replaceChildren(canvas);
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
