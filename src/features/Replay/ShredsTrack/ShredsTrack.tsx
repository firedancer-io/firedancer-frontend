import { getDefaultStore } from "jotai";
import { useCallback, useLayoutEffect, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import { isAggregate, setUpRenderers } from "./utils.ts";
import { drawAggShreds, moveAggCamera } from "./aggUtils.ts";
import {
  drawNonAggShreds,
  getNonAggGranularity,
  getSlotMeshKey,
  moveNonAggCamera,
} from "./nonAggUtils.ts";
import { releaseMesh } from "../../Shreds/WebGl/drawUtils.ts";
import {
  AGG_SHREDS_CHART_ID,
  NON_AGG_SHREDS_CHART_ID,
  shredEventSeries,
} from "./const.ts";
import { useAggShredsQuery, getAggGranularity } from "./useAggShredsQuery.ts";
import { useNonAggShredsQuery } from "./useNonAggShredsQuery.ts";
import type { AggGranularity, ShredsGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import {
  aggShredsAtom,
  drawEventType,
  aggShredsEmitterAtom,
  timelineShredsAtoms,
  timelineFecShredsAtoms,
} from "./atoms.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import styles from "../track.module.css";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import TrackControls from "../TrackControls.tsx";

const height = 300;
const store = getDefaultStore();

function ShredsTrack({ remount }: WebGlRemountProps) {
  const [granularity, setGranularity] = useState<
    AggGranularity | ShredsGranularity | undefined
  >(undefined);

  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderers(setUpContextListeners, getWasContextLost),
    onResize: () => renderActive(),
  });

  const { query: aggQuery, pauseStaleRefreshes: pauseStaleAggRefreshes } =
    useAggShredsQuery(AGG_SHREDS_CHART_ID);

  // Free meshes for slots whose data was just refetched, so the next draw
  // rebuilds them. Does not render; the stale frame stays until that draw.
  const resetMeshes = useCallback(
    (granularity: ShredsGranularity, slotNumbers: number[]) => {
      if (!rendererRef.current || !slotNumbers.length) return;
      const { scene, meshes, availableMeshes } =
        rendererRef.current.nonAggResources;
      for (const slotNumber of slotNumbers) {
        releaseMesh(
          scene,
          meshes,
          availableMeshes,
          getSlotMeshKey(granularity, slotNumber),
        );
      }
    },
    [rendererRef],
  );

  const { query: nonAggQuery, pauseStaleRefreshes: pauseStaleNonAggRefreshes } =
    useNonAggShredsQuery(NON_AGG_SHREDS_CHART_ID, resetMeshes);

  const throttledRelativeTsQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      if (isAggregate(visibleRange)) {
        pauseStaleNonAggRefreshes();
        const queryGranularity = getAggGranularity(
          visibleRange[1] - visibleRange[0],
        );
        aggQuery(referenceNs, visibleRange, worldRange, queryGranularity);
        setGranularity(queryGranularity);
      } else {
        pauseStaleAggRefreshes();
        const queryGranularity = getNonAggGranularity(
          visibleRange[1] - visibleRange[0],
        );
        nonAggQuery(referenceNs, visibleRange, worldRange, queryGranularity);
        setGranularity(queryGranularity);
      }
    },
    100,
    { leading: true, trailing: true },
  );

  const renderActive = useCallback(() => {
    if (!rendererRef.current) return;
    const { renderer, aggResources, nonAggResources } = rendererRef.current;
    const visibleRange = store.get(visibleRangeAtom);
    if (!visibleRange) return;

    const { camera, scene } = isAggregate(visibleRange)
      ? aggResources
      : nonAggResources;
    renderer.render(scene, camera);
  }, [rendererRef]);

  const moveCameraAndDrawNonAgg = useCallback(
    (visibleRange: TsRange) => {
      if (!rendererRef.current) return;

      const referenceNs = store.get(referenceNsAtom);
      const worldRange = store.get(worldRangeAtom);
      if (referenceNs == null || !worldRange) return;

      moveNonAggCamera(rendererRef.current.nonAggResources, visibleRange);
      const granularity = getNonAggGranularity(
        visibleRange[1] - visibleRange[0],
      );

      drawNonAggShreds(
        rendererRef.current,
        granularity,
        referenceNs,
        visibleRange,
        worldRange,
      );

      renderActive();
    },
    [renderActive, rendererRef],
  );

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
      // Move camera before querying, because query may trigger immediate draw if data is already available
      moveAggCamera(rendererRef.current.aggResources, visibleRange);
      throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);
      renderActive();
    } else {
      throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);
      // trigger a redraw immediately to hide trailing incomplete slots and prevent extended shreds.
      moveCameraAndDrawNonAgg(visibleRange);
    }
  }, [
    moveCameraAndDrawNonAgg,
    renderActive,
    rendererRef,
    throttledRelativeTsQuery,
  ]);

  const throttledDrawAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      const aggShreds = store.get(aggShredsAtom);
      if (!rendererRef.current || !visibleRange || referenceNs == null) return;

      drawAggShreds(rendererRef.current, referenceNs, visibleRange, aggShreds);
      renderActive();
    }, [renderActive, rendererRef]),
    50,
    { leading: false, trailing: true },
  );

  const throttledDrawNonAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      if (
        !rendererRef.current ||
        !visibleRange ||
        referenceNs == null ||
        isAggregate(visibleRange)
      )
        return;

      moveCameraAndDrawNonAgg(visibleRange);
    }, [moveCameraAndDrawNonAgg, rendererRef]),
    50,
    { leading: false, trailing: true },
  );

  // subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);
    // listen for agg shreds draw events
    const aggEmitter = store.get(aggShredsEmitterAtom);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

    // listen for non-agg shreds draw events (one emitter per granularity)
    const shredEmitter = store.get(timelineShredsAtoms.emitter);
    const fecEmitter = store.get(timelineFecShredsAtoms.emitter);

    shredEmitter.addListener(drawEventType, throttledDrawNonAgg);
    fecEmitter.addListener(drawEventType, throttledDrawNonAgg);

    // trigger initial draw
    onRangeChange();

    // cleanup
    return () => {
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
      shredEmitter.removeListener(drawEventType, throttledDrawNonAgg);
      fecEmitter.removeListener(drawEventType, throttledDrawNonAgg);
      throttledRelativeTsQuery.cancel();
      throttledDrawAgg.cancel();
      throttledDrawNonAgg.cancel();
      unsubscribeRange();
    };
  }, [
    onRangeChange,
    throttledDrawAgg,
    throttledDrawNonAgg,
    throttledRelativeTsQuery,
  ]);

  return (
    <div className={styles.trackContainer} style={{ height: `${height}px` }}>
      <div ref={containerRef} className={styles.trackCanvasContainer} />
      <TrackControls
        name="Shreds"
        bucketSize={granularity}
        legend={shredEventSeries}
      />
    </div>
  );
}

const ShredsTrackWithRemount = withWebGlRemount(ShredsTrack);
export default ShredsTrackWithRemount;
