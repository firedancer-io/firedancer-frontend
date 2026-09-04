import { useAtomValue, useSetAtom } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import {
  type ExplorableChartProps,
  type MarkerLinesProps,
  type RangeChangeSubscriberProps,
} from "../const.ts";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  getNonAggGranularity,
  useReplayShredsQuery,
} from "./useNonAggShredsQuery.ts";
import {
  convertToShredsRange,
  drawAggShreds,
  drawNonAggShreds,
  isAggregate,
  moveAggCamera,
  moveNonAggCamera,
  setUpRenderers,
} from "./utils.ts";
import { minDirtySlotByChartAtom } from "../../Overview/ShredsProgression/atoms.ts";
import { type RendererObj } from "./const.ts";
import useAggSlotsQuery, { getAggGranularity } from "./useAggShredsQuery.ts";
import { aggShredsAtom } from "../../../api/atoms.ts";
import type { AggGranularity, ShredsGranularity } from "../../../api/types.ts";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import { timelineShredsAtoms } from "./atoms.ts";

const height = 200;
const chartId = "shreds-track";

interface ShredsTrackProps
  extends WebGlRemountProps,
    RangeChangeSubscriberProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
}

function ShredsTrack({
  remount,
  subscribeRangeChange,
  getAbsoluteNs,
  getRelativeMs,
  setUpExploreListeners,
  markerLinesClassName,
  width,
}: ShredsTrackProps) {
  const [granularity, setGranularity] = useState<
    AggGranularity | ShredsGranularity | undefined
  >(undefined);
  const setMinDirtySlotByChart = useSetAtom(minDirtySlotByChartAtom);
  const lastUpdateTs = useAtomValue(timelineShredsAtoms.lastUpdateTs);
  const aggShreds = useAtomValue(aggShredsAtom);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();
  const visibleRangeRef = useRef<TsRange | undefined>();
  // latest world range (ns) seen at query time, read by the shreds query when
  // re-querying invalidated tiles so it uses the freshest world bounds
  const worldRangeNsRef = useRef<NsTsRange>([0n, 0n]);
  const getWorldRangeNs = useCallback(() => worldRangeNsRef.current, []);

  const widthRef = useRef(width);
  widthRef.current = width;
  const hasWidth = width > 0;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const drawNonAgg = useThrottledCallback(
    (visibleRangeMs: TsRange) => {
      if (!rendererRef.current) return;

      const shredsVisibleRange = convertToShredsRange(
        visibleRangeMs,
        getRelativeMs,
      );
      if (!shredsVisibleRange) return;

      // Move camera now because reference ts was missing before first response data
      moveNonAggCamera(
        rendererRef.current.nonAgg.camera,
        visibleRangeMs,
        getRelativeMs,
      );

      drawNonAggShreds(
        rendererRef.current,
        shredsVisibleRange,
        [0, widthRef.current],
        chartId,
      );
    },
    100,
    { leading: true, trailing: true },
  );

  const nonAggQuery = useReplayShredsQuery(getWorldRangeNs);
  const aggQuery = useAggSlotsQuery();

  const throttledRelativeTsQuery = useThrottledCallback(
    (relativeVisibleRange: TsRange, relativeWorldRange: TsRange) => {
      const visibleRangeNs: NsTsRange = [
        getAbsoluteNs(relativeVisibleRange[0]),
        getAbsoluteNs(relativeVisibleRange[1]),
      ];

      if (isAggregate(relativeVisibleRange)) {
        const queryGranularity = getAggGranularity(
          relativeVisibleRange[1] - relativeVisibleRange[0],
        );
        aggQuery(visibleRangeNs, queryGranularity);
        setGranularity(queryGranularity);
      } else {
        const worldRangeNs: NsTsRange = [
          getAbsoluteNs(relativeWorldRange[0]),
          getAbsoluteNs(relativeWorldRange[1]),
        ];
        worldRangeNsRef.current = worldRangeNs;
        const nonAggGranularity = getNonAggGranularity(
          relativeVisibleRange[1] - relativeVisibleRange[0],
        );
        nonAggQuery(visibleRangeNs, worldRangeNs, nonAggGranularity);
        setGranularity(nonAggGranularity);
      }
    },
    100,
    { leading: true, trailing: true },
  );

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      // renderer is created by the setup effect before we subscribe
      if (!rendererRef.current) return;
      const { renderer, agg, nonAgg } = rendererRef.current;
      visibleRangeRef.current = visibleRangeMs;

      throttledRelativeTsQuery(visibleRangeMs, worldRangeMs);

      if (isAggregate(visibleRangeMs)) {
        moveAggCamera(agg, visibleRangeMs);
        renderer.render(agg.scene, agg.camera);
      } else {
        moveNonAggCamera(nonAgg.camera, visibleRangeMs, getRelativeMs);
        renderer.render(nonAgg.scene, nonAgg.camera);
      }

      // deleteTimelineShreds(true, false, true);
    },
    [throttledRelativeTsQuery, getRelativeMs],
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !hasWidth) return;

    const rendererObj = setUpRenderers(
      widthRef.current,
      height,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    // setup dirty slot tracking
    setMinDirtySlotByChart((prev) => {
      // trigger draw of every slot
      prev.set(chartId, -Infinity);
      return prev;
    });

    rendererRef.current = rendererObj;
    containerRef.current?.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribe = subscribeRangeChange(chartId, onRangeChange);
    const cleanupExploreListeners = containerRef.current
      ? setUpExploreListeners(containerRef.current)
      : undefined;

    // cleanup
    return () => {
      setMinDirtySlotByChart((prev) => {
        prev.delete(chartId);
        return prev;
      });

      unsubscribe?.();
      rendererRef.current?.cleanUp();
      rendererRef.current = undefined;
      cleanupExploreListeners?.();
    };
  }, [
    onRangeChange,
    setUpExploreListeners,
    subscribeRangeChange,
    setUpContextListeners,
    getWasContextLost,
    hasWidth,
    setMinDirtySlotByChart,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!rendererRef.current || !visibleRangeRef.current) return;
    const { renderer, nonAgg, agg } = rendererRef.current;

    renderer.setSize(width, height);
    const { camera, scene } = isAggregate(visibleRangeRef.current)
      ? agg
      : nonAgg;
    renderer.render(scene, camera);
  }, [width]);

  // trigger draw
  useLayoutEffect(() => {
    if (!rendererRef.current || !visibleRangeRef.current) return;

    // TODO: handle deletion of old data
    if (isAggregate(visibleRangeRef.current)) {
      if (aggShreds) {
        drawAggShreds(
          rendererRef.current.renderer,
          rendererRef.current.agg,
          aggShreds,
          getRelativeMs,
        );
      }
    } else {
      drawNonAgg(visibleRangeRef.current);
    }
  }, [getRelativeMs, lastUpdateTs, aggShreds, drawNonAgg]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: `${height}px`,
      }}
    >
      <div
        ref={containerRef}
        className={markerLinesClassName}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
        }}
      />
      <div style={{ position: "absolute", top: 0, left: "5px" }}>
        Bucket size: {granularity ?? "-"}
      </div>
    </div>
  );
}

const ShredsTrackWithRemount = withWebGlRemount(ShredsTrack);
export default ShredsTrackWithRemount;
