import { getDefaultStore } from "jotai";
import { useCallback, useLayoutEffect, useState } from "react";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawAggSlots,
  isAggregate,
  moveAggCamera,
  setUpRenderers,
} from "./utils.ts";
import { aggTrackHeight } from "./const.ts";
import { useAggHeaderQuery, getAggGranularity } from "./useAggHeaderQuery.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import clsx from "clsx";
import styles from "../track.module.css";
import {
  aggHeaderEmitterAtom,
  aggSlotsAtom,
  drawEventType,
} from "./aggAtoms.ts";
import TrackControls from "../TrackControls.tsx";
import { Box } from "@radix-ui/themes";

const chartId = "agg-header-track";
const store = getDefaultStore();

interface AggHeaderTrackProps extends WebGlRemountProps {
  className: string;
  setAggDrawable: (isDrawable: boolean) => void;
}

function AggHeaderTrack({
  remount,
  className,
  setAggDrawable,
}: AggHeaderTrackProps) {
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );
  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderers(setUpContextListeners, getWasContextLost),
    onResize: () => render(),
  });

  const {
    query: aggQuery,
    getDrawTiles,
    isVisibleDrawable,
    pauseStaleRefreshes,
  } = useAggHeaderQuery(chartId);

  const updateDrawable = useCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      setAggDrawable(
        isVisibleDrawable(
          getAggGranularity(visibleRange[1] - visibleRange[0]),
          referenceNs,
          visibleRange,
          worldRange,
        ),
      );
    },
    [isVisibleDrawable, setAggDrawable],
  );

  const throttledRelativeTsQuery = useThrottledCallbackIfVisible(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      if (isAggregate(visibleRange)) {
        const queryGranularity = getAggGranularity(
          visibleRange[1] - visibleRange[0],
        );
        aggQuery(referenceNs, visibleRange, worldRange, queryGranularity);
        setGranularity(queryGranularity);
      } else {
        pauseStaleRefreshes();
        // TODO: non-aggregate query
        setGranularity(undefined);
      }
    },
    100,
    { leading: true, trailing: true },
  );

  /**
   * Render even if non agg is shown, since agg may be shown before the next draw
   */
  const render = useCallback(() => {
    if (!rendererRef.current) return;

    const { renderer, aggResources } = rendererRef.current;
    const { camera, scene } = aggResources;
    renderer.render(scene, camera);
  }, [rendererRef]);

  /**
   * Update camera, toggle visibility, and query data for a new range.
   */
  const onRangeChange = useCallback(() => {
    if (!rendererRef.current) return;

    const referenceNs = store.get(referenceNsAtom);
    const worldRange = store.get(worldRangeAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange || !worldRange) return;

    // Move camera before querying, because query may trigger immediate draw if data is already available.
    // Always move the camera, since agg may stay shown after zooming into non agg
    moveAggCamera(rendererRef.current.aggResources, visibleRange);
    throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);
    render();
    updateDrawable(referenceNs, visibleRange, worldRange);
  }, [render, rendererRef, throttledRelativeTsQuery, updateDrawable]);

  const throttledDrawAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      const worldRange = store.get(worldRangeAtom);
      const aggSlots = store.get(aggSlotsAtom);
      if (
        !rendererRef.current ||
        !visibleRange ||
        !worldRange ||
        referenceNs == null
      ) {
        return;
      }

      drawAggSlots(
        rendererRef.current,
        referenceNs,
        visibleRange,
        aggSlots,
        getDrawTiles,
      );
      render();
      updateDrawable(referenceNs, visibleRange, worldRange);
    }, [rendererRef, render, updateDrawable, getDrawTiles]),
    50,
    { leading: true, trailing: true },
  );

  // subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);

    // listen for agg slots draw events
    const aggEmitter = store.get(aggHeaderEmitterAtom);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

    // trigger initial draw
    onRangeChange();

    // cleanup
    return () => {
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
      throttledDrawAgg.cancel();
      throttledRelativeTsQuery.cancel();
      unsubscribeRange();
    };
  }, [onRangeChange, throttledDrawAgg, throttledRelativeTsQuery]);

  return (
    <Box
      height={`${aggTrackHeight}px`}
      className={clsx(className, styles.trackContainer)}
    >
      <div ref={containerRef} className={styles.trackCanvasContainer} />
      <TrackControls name="Slots" bucketSize={granularity} />
    </Box>
  );
}

const AggHeaderTrackWithRemount = withWebGlRemount(AggHeaderTrack);
export default AggHeaderTrackWithRemount;
