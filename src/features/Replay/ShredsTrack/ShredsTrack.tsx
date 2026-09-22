import { getDefaultStore, useAtomValue } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import { type ExplorableChartProps, type MarkerLinesProps } from "../const.ts";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawAggShreds,
  isAggregate,
  moveAggCamera,
  setUpRenderers,
} from "./utils.ts";
// TODO: handle non-agg shreds (minDirtySlotByChartAtom dirty-slot tracking)
import { type RendererObj } from "./const.ts";
import { useAggShredsQuery, getAggGranularity } from "./useAggShredsQuery.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import { aggShredsAtom, lastUpdateTsAtom } from "./atoms.ts";
import { calcAbsoluteNs } from "../utils.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";

const height = 500;
const chartId = "shreds-track";
const store = getDefaultStore();

interface ShredsTrackProps
  extends WebGlRemountProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
}

function ShredsTrack({
  remount,
  setUpExploreListeners,
  markerLinesClassName,
  width,
}: ShredsTrackProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  // TODO: handle non-agg shreds granularity
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const aggQuery = useAggShredsQuery(chartId);
  const aggShreds = useAtomValue(aggShredsAtom);
  const lastAggUpdateTs = useAtomValue(lastUpdateTsAtom);

  const throttledAggQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
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
    200,
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

    const { aggResources } = rendererRef.current;

    if (isAggregate(visibleRange)) {
      throttledAggQuery(referenceNs, visibleRange, worldRange);
      moveAggCamera(aggResources, visibleRange);
    } else {
      // TODO: handle non-agg shreds
    }
    renderActive();
  }, [renderActive, throttledAggQuery]);

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !containerRef.current) return;

    const rendererObj = setUpRenderers(
      0,
      height,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    // TODO: handle non-agg shreds (set up dirty slot tracking via
    // minDirtySlotByChartAtom)

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
      // TODO: handle non-agg shreds (clean up dirty slot tracking)
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
    rendererRef.current.renderer.setSize(width, height);
    renderActive();
  }, [renderActive, width, isInitialized]);

  // trigger draw
  useLayoutEffect(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (
      !rendererRef.current ||
      !visibleRange ||
      !aggShreds ||
      referenceNs == null
    )
      return;

    if (isAggregate(visibleRange)) {
      drawAggShreds(rendererRef.current, referenceNs, visibleRange, aggShreds);
    } else {
      // TODO: draw non-agg
    }
    renderActive();
  }, [renderActive, aggShreds, lastAggUpdateTs]);

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
