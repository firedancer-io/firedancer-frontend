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
  drawNonAggRevenue,
  isAggregate,
  moveAggCamera,
  moveNonAggCamera,
  setUpRenderers,
  type RendererObj,
} from "./utils.ts";
import RevenueYAxis from "./RevenueYAxis.tsx";
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
      const flipped = agg !== prevIsAggRef.current;
      prevIsAggRef.current = agg;
      setIsAgg(agg);

      if (agg) {
        moveAggCamera(rendererRef.current, visibleRangeMs);
        if (flipped && aggRevenueRef.current) {
          const maxValue = drawAggRevenue(
            rendererRef.current,
            type,
            aggRevenueRef.current,
            getRelativeMs,
          );
          setAxisMaxValue(maxValue);
        }
      } else {
        moveNonAggCamera(rendererRef.current, visibleRangeMs);
        const maxValue = drawNonAggRevenue(
          rendererRef.current,
          type,
          txnMetaCacheRef.current,
          getRelativeMs,
          renderMinWidthRef.current ? 1 : 0,
          splitByRowRef.current ? Math.max(bankCountRef.current, 1) : 1,
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
    );
    setAxisMaxValue(maxValue);
    renderActive();
  }, [aggRevenue, getRelativeMs, renderActive, type, isAgg]);

  useLayoutEffect(() => {
    if (!rendererRef.current || isAgg) return;
    const maxValue = drawNonAggRevenue(
      rendererRef.current,
      type,
      txnMetaCache,
      getRelativeMs,
      renderMinWidth ? 1 : 0,
      splitByRow ? Math.max(bankCount, 1) : 1,
    );
    setAxisMaxValue(maxValue);
    renderActive();
  }, [
    txnMetaCache,
    getRelativeMs,
    renderActive,
    type,
    isAgg,
    renderMinWidth,
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
        <RevenueYAxis maxValue={axisMaxValue} isAgg={isAgg} />
      )}
      <RevenueControls
        isAgg={isAgg}
        granularity={granularity}
        renderMinWidth={renderMinWidth}
        setRenderMinWidth={setRenderMinWidth}
        splitByRow={splitByRow}
        setSplitByRow={setSplitByRow}
      />
    </div>
  );
}

interface RevenueControlsProps {
  isAgg: boolean;
  granularity: AggGranularity | undefined;
  renderMinWidth: boolean;
  setRenderMinWidth: (value: boolean) => void;
  splitByRow: boolean;
  setSplitByRow: (value: boolean) => void;
}

function RevenueControls({
  isAgg,
  granularity,
  renderMinWidth,
  setRenderMinWidth,
  splitByRow,
  setSplitByRow,
}: RevenueControlsProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: "5px",
        display: "flex",
        gap: "12px",
        alignItems: "center",
      }}
    >
      <span>Bucket size: {isAgg ? (granularity ?? "-") : "Txn"}</span>
      {!isAgg && (
        <>
          <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={renderMinWidth}
              onChange={(e) => setRenderMinWidth(e.target.checked)}
            />
            Min width
          </label>
          <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={splitByRow}
              onChange={(e) => setSplitByRow(e.target.checked)}
            />
            Split by tile
          </label>
        </>
      )}
    </div>
  );
}

const RevenueTrackWithRemount = withWebGlRemount(RevenueTrack);
export default RevenueTrackWithRemount;
