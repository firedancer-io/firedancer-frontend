import { useAtomValue } from "jotai";
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
  drawAggRevenue,
  isAggregate,
  moveAggCamera,
  setUpRenderers,
  type RendererObj,
} from "./utils.ts";
import useAggRevenueQuery, { getGranularity } from "./useAggRevenueQuery.ts";
import type { RevenueType } from "../../../api/entities.ts";
import { aggRevenueAtom } from "../../../api/atoms.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";

const height = 150;
const baseSubscriptionId = "revenue-track";

interface RevenueTrackProps
  extends WebGlRemountProps,
    RangeChangeSubscriberProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
  type: RevenueType;
}

function RevenueTrack({
  remount,
  subscribeRangeChange,
  getAbsoluteNs,
  getRelativeMs,
  setUpExploreListeners,
  markerLinesClassName,
  width,
  type,
}: RevenueTrackProps) {
  const subscriptionId = `${type}-${baseSubscriptionId}`;
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const widthRef = useRef(width);
  widthRef.current = width;
  const hasWidth = width > 0;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const aggQuery = useAggRevenueQuery();
  const aggRevenue = useAtomValue(aggRevenueAtom);

  const throttledRelativeTsQuery = useThrottledCallback(
    (relativeVisibleRange: TsRange, relativeWorldRange: TsRange) => {
      if (!aggQuery) return;
      const visibleRangeNs: NsTsRange = [
        getAbsoluteNs(relativeVisibleRange[0]),
        getAbsoluteNs(relativeVisibleRange[1]),
      ];

      if (isAggregate(relativeVisibleRange)) {
        const queryGranularity = getGranularity(
          relativeVisibleRange[1] - relativeVisibleRange[0],
        );
        aggQuery(visibleRangeNs, queryGranularity);
        setGranularity(queryGranularity);
      } else {
        // TODO: non-aggregate query
        setGranularity(undefined);
      }
    },
    100,
    { leading: true, trailing: true },
  );

  const renderActive = useCallback(() => {
    if (!rendererRef.current) return;
    const { renderer, aggResources } = rendererRef.current;
    // TODO: add non-aggregate resources
    const { camera, scene } = aggResources;
    renderer.render(scene, camera);
  }, []);

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      if (!rendererRef.current) return;

      throttledRelativeTsQuery(visibleRangeMs, worldRangeMs);

      if (isAggregate(visibleRangeMs)) {
        moveAggCamera(rendererRef.current, visibleRangeMs);
      } else {
        // TODO: move non-agg camera
      }
      renderActive();
    },
    [renderActive, throttledRelativeTsQuery],
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !hasWidth || !containerRef.current) return;

    const rendererObj = setUpRenderers(
      widthRef.current,
      height,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribe = subscribeRangeChange(subscriptionId, onRangeChange);
    const cleanUpExploreListeners = setUpExploreListeners(containerRef.current);
    const cleanUpRenderer = rendererRef.current.cleanUp;

    // cleanup
    return () => {
      unsubscribe?.();
      cleanUpRenderer();
      rendererRef.current = undefined;
      cleanUpExploreListeners();
    };
  }, [
    onRangeChange,
    setUpExploreListeners,
    subscribeRangeChange,
    setUpContextListeners,
    getWasContextLost,
    hasWidth,
    subscriptionId,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    renderActive();
  }, [renderActive, width]);

  // trigger draw
  useLayoutEffect(() => {
    if (!rendererRef.current || !aggRevenue) return;
    // TODO: draw non-agg
    drawAggRevenue(rendererRef.current, type, aggRevenue, getRelativeMs);
    renderActive();
  }, [aggRevenue, getRelativeMs, renderActive, type]);

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

const RevenueTrackWithRemount = withWebGlRemount(RevenueTrack);
export default RevenueTrackWithRemount;
