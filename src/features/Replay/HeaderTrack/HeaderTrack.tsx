import { getDefaultStore, useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import { type ExplorableChartProps, type MarkerLinesProps } from "../const.ts";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawAggSlots,
  isAggregate,
  moveAggCamera,
  setUpRenderers,
  trackHeight,
} from "./utils.ts";
import { type RendererObj } from "./const.ts";
import { useAggHeaderQuery, getAggGranularity } from "./useAggHeaderQuery.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import { aggSlotsAtom, lastUpdateTsAtom } from "./atoms.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import { calcAbsoluteNs } from "../utils.ts";

const chartId = "header-track";
const store = getDefaultStore();

interface HeaderTrackProps
  extends WebGlRemountProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
}

function HeaderTrack({
  remount,
  setUpExploreListeners,
  markerLinesClassName,
  width,
}: HeaderTrackProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const aggQuery = useAggHeaderQuery(chartId);
  const aggSlots = useAtomValue(aggSlotsAtom);
  const lastAggUpdateTs = useAtomValue(lastUpdateTsAtom);

  const throttledAggQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      if (!aggQuery) return;
      const visibleRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, visibleRange[0]),
        calcAbsoluteNs(referenceNs, visibleRange[1]),
      ];

      const worldRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, worldRange[0]),
        calcAbsoluteNs(referenceNs, worldRange[1]),
      ];

      if (isAggregate(visibleRange)) {
        const queryGranularity = getAggGranularity(
          visibleRangeNs[1] - visibleRangeNs[0],
        );
        aggQuery(visibleRangeNs, worldRangeNs, queryGranularity);
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
  const onRangeChange = useCallback(() => {
    if (!rendererRef.current) return;

    const referenceNs = store.get(referenceNsAtom);
    const worldRange = store.get(worldRangeAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange || !worldRange) return;

    if (isAggregate(visibleRange)) {
      throttledAggQuery(referenceNs, visibleRange, worldRange);
      moveAggCamera(rendererRef.current.aggResources, visibleRange);
    } else {
      // TODO: handle non-agg slots
    }
    renderActive();
  }, [renderActive, throttledAggQuery]);

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !containerRef.current) return;

    const rendererObj = setUpRenderers(
      0,
      trackHeight,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribe = store.sub(visibleRangeAtom, onRangeChange);
    const cleanUpExploreListeners = setUpExploreListeners(containerRef.current);
    const cleanUpRenderer = rendererRef.current.cleanUp;

    // trigger initial draw
    setIsInitialized(true);
    onRangeChange();

    // cleanup
    return () => {
      unsubscribe();
      cleanUpRenderer();
      rendererRef.current = undefined;
      cleanUpExploreListeners();
    };
  }, [
    onRangeChange,
    setUpExploreListeners,
    setUpContextListeners,
    getWasContextLost,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, trackHeight);
    renderActive();
  }, [isInitialized, renderActive, width]);

  // trigger draw
  useLayoutEffect(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (
      !rendererRef.current ||
      !visibleRange ||
      !aggSlots ||
      referenceNs == null
    )
      return;

    if (isAggregate(visibleRange)) {
      drawAggSlots(rendererRef.current, referenceNs, visibleRange, aggSlots);
    } else {
      // TODO: draw non-agg
    }
    renderActive();
  }, [renderActive, aggSlots, lastAggUpdateTs]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: `${trackHeight}px`,
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

const HeaderTrackWithRemount = withWebGlRemount(HeaderTrack);
export default HeaderTrackWithRemount;
