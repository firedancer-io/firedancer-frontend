import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { useMeasure, useRafLoop } from "react-use";
import { Box, Flex } from "@radix-ui/themes";
import type { FlexProps } from "@radix-ui/themes";
import { useShredsChartScale } from "../useShredsChartScale";
import { useSetAtom } from "jotai";
import { isWebgl2SupportedAtom, minDirtySlotByChartAtom } from "../atoms";
import type { RendererObj, TsRange } from "./chartUtils";
import { setUpRenderer, draw } from "./chartUtils";
import ShredsSlotLabels from "../ShredsSlotLabels";
import { MChartAxes, xAxisHeight } from "./ChartAxes";
import { createLabelsState, type LabelsState } from "../utils";
import { disposeWebglResources } from "../webglUtils";

const REDRAW_INTERVAL_MS = 15;
/**
 * How long to wait for the GPU to restore a lost WebGL context before falling back to the canvas chart.
 * Context loss is usually transient (tab backgrounded, GPU reset, driver hiccup) and the browser restores it within
 * 1 ~ 2 frames.
 */
const CONTEXT_RESTORE_TIMEOUT_MS = 10_000;

interface ShredsChartProps
  extends Pick<FlexProps, "height" | "minHeight" | "flexGrow"> {
  chartId: string;
}
export default function ShredsChart(props: ShredsChartProps) {
  const [key, setKey] = useState(0);
  const triggerRemount = useCallback(() => {
    setKey((prev) => prev + 1);
  }, [setKey]);
  return (
    <ShredsChartInner key={key} {...props} triggerRemount={triggerRemount} />
  );
}

interface ShredsChartInnerProps extends ShredsChartProps {
  triggerRemount: () => void;
}

export function ShredsChartInner({
  chartId,
  triggerRemount,
  ...flexProps
}: ShredsChartInnerProps) {
  const setMinDirtySlotByChart = useSetAtom(minDirtySlotByChartAtom);
  const setWebgl2Supported = useSetAtom(isWebgl2SupportedAtom);

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
  /**
   * timeout to use canvas chart fallback when context is lost and not restored
   */
  const contextLostTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const scale = useShredsChartScale();

  const handleContextLost = useCallback(
    (event: Event) => {
      // preventDefault so that the browser fires webglcontextrestored
      event.preventDefault();

      clearTimeout(contextLostTimeoutRef.current);
      contextLostTimeoutRef.current = setTimeout(() => {
        setWebgl2Supported(false);
      }, CONTEXT_RESTORE_TIMEOUT_MS);
    },
    [setWebgl2Supported],
  );

  const handleContextRestored = useCallback(() => {
    clearTimeout(contextLostTimeoutRef.current);
    // clear so unmount cleans up resources
    contextLostTimeoutRef.current = undefined;
    triggerRemount();
  }, [triggerRemount]);

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

      const isContextLost = contextLostTimeoutRef.current != null;
      clearTimeout(contextLostTimeoutRef.current);

      const obj = rendererRef.current;
      if (!obj) return;

      obj.renderer.domElement.removeEventListener(
        "webglcontextlost",
        handleContextLost,
      );
      obj.renderer.domElement.removeEventListener(
        "webglcontextrestored",
        handleContextRestored,
      );

      // When the context is lost, its GPU objects are already gone so skip GL cleanup
      if (!isContextLost) {
        for (const slotMesh of obj.meshes.values()) {
          slotMesh.mesh.geometry.dispose();
        }
        for (const slotMesh of obj.availableMeshes) {
          slotMesh.mesh.geometry.dispose();
        }
        // dispose this chart's own unitQuad / sharedMaterial
        disposeWebglResources(obj.resources);

        obj.renderer.dispose();
        // force release of GL context on repeated mount / unmounts
        obj.renderer.forceContextLoss();
      }

      obj.renderer.domElement.remove();
      rendererRef.current = undefined;
    };
  }, [
    chartId,
    handleContextLost,
    handleContextRestored,
    setMinDirtySlotByChart,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    // skip while the context is lost. Remount on restore will handle resizing
    if (!rendererRef.current || contextLostTimeoutRef.current != null) return;

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
  }, [scale, width, height, chartId]);

  useRafLoop(function drawShredsLoop(time: number) {
    // Don't draw while waiting for context restore.
    // but keep canvas mounted to listen for restore event.
    if (contextLostTimeoutRef.current != null) return;

    // skip until valid size is initialized
    if (width <= 0 || height <= 0) return;

    if (
      lastRedrawRef.current == null ||
      time - lastRedrawRef.current >= REDRAW_INTERVAL_MS
    ) {
      lastRedrawRef.current = time;
      if (!rendererRef.current) {
        const rendererObj = setUpRenderer(width, height);
        if (!rendererObj) return;

        rendererRef.current = rendererObj;
        const canvas = rendererObj.renderer.domElement;
        canvas.addEventListener("webglcontextlost", handleContextLost);
        canvas.addEventListener("webglcontextrestored", handleContextRestored);
        containerRef.current?.replaceChildren(canvas);
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
