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
  buildNonAggBuffer,
  drawAggRevenue,
  isAggregate,
  moveAggCamera,
  moveNonAggCamera,
  refreshNonAggView,
  setUpRenderers,
  type RendererObj,
} from "./utils.ts";
import RevenueYAxis from "./RevenueYAxis.tsx";
import RevenueControls from "./RevenueControls.tsx";
import { DEFAULT_REVENUE_SCALE, type RevenueScale } from "./consts.ts";
import useAggRevenueQuery, { getGranularity } from "./useAggRevenueQuery.ts";
import useTxnMetaQuery from "./useTxnMetaQuery.ts";
import { replayTxnMetaCacheAtom } from "./txnMeta.ts";
import { tileCountAtom } from "../../Overview/SlotPerformance/atoms.ts";
import type { RevenueType } from "../../../api/entities.ts";
import { aggRevenueAtom } from "../../../api/atoms.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";

const height = 150;
const baseSubscriptionId = "revenue-track";

// bankCount is already clamped to >= 1, so no Math.max needed here.
const rowsFor = (split: boolean, banks: number) => (split ? banks : 1);

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
  const [isAgg, setIsAgg] = useState(true);
  const [renderMinWidth, setRenderMinWidth] = useState(true);
  const [splitByRow, setSplitByRow] = useState(false);
  const [scale, setScale] = useState<RevenueScale>(DEFAULT_REVENUE_SCALE);
  const [axisMaxValue, setAxisMaxValue] = useState(0n);

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
  const txnMetaQuery = useTxnMetaQuery();
  const txnMetaCache = useAtomValue(replayTxnMetaCacheAtom);
  const execrpCount = useAtomValue(tileCountAtom).execrp;
  const bankCount = execrpCount > 0 ? execrpCount : 1;

  const aggRevenueRef = useRef(aggRevenue);
  aggRevenueRef.current = aggRevenue;
  const txnMetaCacheRef = useRef(txnMetaCache);
  txnMetaCacheRef.current = txnMetaCache;
  const renderMinWidthRef = useRef(renderMinWidth);
  renderMinWidthRef.current = renderMinWidth;
  const splitByRowRef = useRef(splitByRow);
  splitByRowRef.current = splitByRow;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const bankCountRef = useRef(bankCount);
  bankCountRef.current = bankCount;
  const prevIsAggRef = useRef(isAgg);

  const throttledRelativeTsQuery = useThrottledCallback(
    (relativeVisibleRange: TsRange, relativeWorldRange: TsRange) => {
      const visibleRangeNs: NsTsRange = [
        getAbsoluteNs(relativeVisibleRange[0]),
        getAbsoluteNs(relativeVisibleRange[1]),
      ];

      if (isAggregate(relativeVisibleRange)) {
        if (!aggQuery) return;
        const queryGranularity = getGranularity(
          relativeVisibleRange[1] - relativeVisibleRange[0],
        );
        aggQuery(visibleRangeNs, queryGranularity);
        setGranularity(queryGranularity);
      } else {
        txnMetaQuery(visibleRangeNs, getAbsoluteNs(relativeWorldRange[1]));
        setGranularity(undefined);
      }
    },
    100,
    { leading: true, trailing: true },
  );

  const renderMode = useCallback((agg: boolean) => {
    if (!rendererRef.current) return;
    const { renderer, aggResources, nonAggResources } = rendererRef.current;
    const { camera, scene } = agg ? aggResources : nonAggResources;
    renderer.render(scene, camera);
  }, []);

  const renderActive = useCallback(
    () => renderMode(isAgg),
    [renderMode, isAgg],
  );

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      if (!rendererRef.current) return;

      throttledRelativeTsQuery(visibleRangeMs, worldRangeMs);

      const agg = isAggregate(visibleRangeMs);
      const modeChanged = agg !== prevIsAggRef.current;
      prevIsAggRef.current = agg;
      setIsAgg(agg);

      if (agg) {
        moveAggCamera(rendererRef.current, visibleRangeMs);
        if (modeChanged && aggRevenueRef.current) {
          const maxValue = drawAggRevenue(
            rendererRef.current,
            type,
            aggRevenueRef.current,
            getRelativeMs,
            scaleRef.current,
          );
          setAxisMaxValue(maxValue);
        }
      } else {
        // On mode switch the per-txn buffer is stale, so rebuild it once.
        // Pan/zoom within this mode only moves the camera and refreshes uniforms.
        if (modeChanged) {
          buildNonAggBuffer(
            rendererRef.current,
            type,
            txnMetaCacheRef.current,
            getRelativeMs,
            rowsFor(splitByRowRef.current, bankCountRef.current),
          );
        }
        moveNonAggCamera(rendererRef.current, visibleRangeMs);
        const maxValue = refreshNonAggView(
          rendererRef.current,
          type,
          txnMetaCacheRef.current,
          getRelativeMs,
          renderMinWidthRef.current ? 1 : 0,
          rowsFor(splitByRowRef.current, bankCountRef.current),
          scaleRef.current,
        );
        setAxisMaxValue(maxValue);
      }
      renderMode(agg);
    },
    [renderMode, throttledRelativeTsQuery, type, getRelativeMs],
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

  useLayoutEffect(() => {
    if (!rendererRef.current || !aggRevenue || !isAgg) return;
    const maxValue = drawAggRevenue(
      rendererRef.current,
      type,
      aggRevenue,
      getRelativeMs,
      scale,
    );
    setAxisMaxValue(maxValue);
    renderActive();
  }, [aggRevenue, getRelativeMs, renderActive, type, isAgg, scale]);

  // Rebuild the per-txn instance buffer only when the underlying data or the
  // txn/row layout changes (not on pan/zoom or styling-uniform changes).
  useLayoutEffect(() => {
    if (!rendererRef.current || isAgg) return;
    const rows = rowsFor(splitByRow, bankCount);
    buildNonAggBuffer(
      rendererRef.current,
      type,
      txnMetaCache,
      getRelativeMs,
      rows,
    );
    const maxValue = refreshNonAggView(
      rendererRef.current,
      type,
      txnMetaCache,
      getRelativeMs,
      renderMinWidthRef.current ? 1 : 0,
      rows,
      scaleRef.current,
    );
    setAxisMaxValue(maxValue);
    renderActive();
  }, [
    txnMetaCache,
    getRelativeMs,
    renderActive,
    type,
    isAgg,
    splitByRow,
    bankCount,
  ]);

  // Styling-only changes (min-width floor, scale) update uniforms without
  // rebuilding the buffer.
  useLayoutEffect(() => {
    if (!rendererRef.current || isAgg) return;
    const maxValue = refreshNonAggView(
      rendererRef.current,
      type,
      txnMetaCache,
      getRelativeMs,
      renderMinWidth ? 1 : 0,
      rowsFor(splitByRow, bankCount),
      scale,
    );
    setAxisMaxValue(maxValue);
    renderActive();
  }, [
    getRelativeMs,
    renderActive,
    type,
    isAgg,
    renderMinWidth,
    scale,
    txnMetaCache,
    splitByRow,
    bankCount,
  ]);

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
      {(isAgg || !splitByRow) && (
        <RevenueYAxis maxValue={axisMaxValue} scale={scale} />
      )}
      <RevenueControls
        isAgg={isAgg}
        granularity={granularity}
        renderMinWidth={renderMinWidth}
        setRenderMinWidth={setRenderMinWidth}
        splitByRow={splitByRow}
        setSplitByRow={setSplitByRow}
        scale={scale}
        setScale={setScale}
      />
    </div>
  );
}

const RevenueTrackWithRemount = withWebGlRemount(RevenueTrack);
export default RevenueTrackWithRemount;
