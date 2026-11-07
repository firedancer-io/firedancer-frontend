import { getDefaultStore } from "jotai";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import { useFrameRender } from "../../WebGl/useFrameRender.ts";
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
  aggShredEvents,
  NON_AGG_SHREDS_CHART_ID,
  shredLegend,
} from "./const.ts";
import { useAggShredsQuery, getAggGranularity } from "./useAggShredsQuery.ts";
import { useNonAggShredsQuery } from "./useNonAggShredsQuery.ts";
import type { AggGranularity, ShredsGranularity } from "../../../api/types.ts";
import { ShredsGranularityEnum } from "../../../api/entities.ts";
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
import { trackNames } from "../layout.ts";
import type { DataLevel } from "../coverage.ts";
import { useModeCoverage } from "../useModeCoverage.ts";

const store = getDefaultStore();

function isShredsGranularity(
  granularity: AggGranularity | ShredsGranularity | undefined,
): granularity is ShredsGranularity {
  return (
    granularity === ShredsGranularityEnum.shred ||
    granularity === ShredsGranularityEnum.fec
  );
}

/**
 * Granularity the visible range should be drawn at
 */
function getTargetGranularity(
  visibleRange: TsRange,
): AggGranularity | ShredsGranularity {
  const windowMs = visibleRange[1] - visibleRange[0];
  return isAggregate(visibleRange)
    ? getAggGranularity(windowMs)
    : getNonAggGranularity(windowMs);
}

function ShredsTrack({ remount }: WebGlRemountProps) {
  const [granularity, setGranularity] = useState<
    AggGranularity | ShredsGranularity | undefined
  >(undefined);

  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderers(setUpContextListeners, getWasContextLost),
    onResize: () => redraw(),
  });

  const {
    query: aggQuery,
    granularityLevels: aggLevels,
    pauseStaleRefreshes: pauseStaleAggRefreshes,
  } = useAggShredsQuery(AGG_SHREDS_CHART_ID);

  // Free meshes for slots whose data was just refetched, so the next draw
  // rebuilds them. Does not render; the stale frame stays until that draw.
  const resetMeshes = useCallback(
    (granularity: ShredsGranularity, slotNumbers: number[]) => {
      if (!rendererRef.current || !slotNumbers.length) return;
      const {
        scene,
        meshes,
        availableMeshes,
        edgeMeshes,
        availableEdgeMeshes,
      } = rendererRef.current.nonAggResources;
      for (const slotNumber of slotNumbers) {
        const key = getSlotMeshKey(granularity, slotNumber);
        releaseMesh(scene, meshes, availableMeshes, key);
        releaseMesh(scene, edgeMeshes, availableEdgeMeshes, key);
      }
    },
    [rendererRef],
  );

  const {
    query: nonAggQuery,
    granularityLevels: nonAggLevels,
    pauseStaleRefreshes: pauseStaleNonAggRefreshes,
  } = useNonAggShredsQuery(NON_AGG_SHREDS_CHART_ID, resetMeshes);

  /** agg then non agg granularities, from coarsest to finest */
  const granularityLevels = useMemo<
    DataLevel<AggGranularity | ShredsGranularity>[]
  >(() => [...aggLevels, ...nonAggLevels], [aggLevels, nonAggLevels]);

  const {
    modeRangesRef,
    resolveModeRanges,
    startAggDraw,
    shouldDrawAgg,
    shouldDrawAggAfterNonAgg,
    renderModes,
  } = useModeCoverage({
    granularityLevels,
    getTargetGranularity,
    getAggGranularity,
  });

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
    renderModes(renderer, aggResources, nonAggResources);
  }, [rendererRef, renderModes]);

  const requestRender = useFrameRender(renderActive);

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

      requestRender();
    },
    [requestRender, rendererRef],
  );

  // Redraw without refetching
  const redraw = useCallback(() => {
    const visibleRange = store.get(visibleRangeAtom);
    if (!visibleRange) return;
    // agg has no size-dependent uniforms, so only non agg needs a redraw
    if (modeRangesRef.current.nonAgg.length) {
      moveCameraAndDrawNonAgg(visibleRange);
    }
    renderActive();
  }, [modeRangesRef, moveCameraAndDrawNonAgg, renderActive]);

  /**
   * Draw the agg mesh for the agg spans
   */
  const drawAgg = useCallback(() => {
    if (!rendererRef.current) return;
    const aggDraw = startAggDraw();
    if (!aggDraw) return;

    drawAggShreds(
      rendererRef.current,
      aggDraw.referenceNs,
      aggDraw.visibleRange,
      store.get(aggShredsAtom),
      aggDraw.granularity,
      aggDraw.getDrawTiles,
    );
  }, [rendererRef, startAggDraw]);

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(() => {
    if (!rendererRef.current) return;

    const referenceNs = store.get(referenceNsAtom);
    const worldRange = store.get(worldRangeAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange || !worldRange) return;

    // Move camera before querying, because query may trigger immediate draw if data is already available.
    moveAggCamera(rendererRef.current.aggResources, visibleRange);
    throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);

    const { nonAgg } = resolveModeRanges();
    // Redraw agg from cache immediately if the mesh is outdated, since the
    // draw event waits on a query round trip. Otherwise moving the camera is
    // enough, e.g. on live frames
    if (shouldDrawAgg()) drawAgg();
    // trigger a redraw immediately to hide trailing incomplete slots and prevent extended shreds.
    if (nonAgg.length) moveCameraAndDrawNonAgg(visibleRange);
    requestRender();
  }, [
    drawAgg,
    moveCameraAndDrawNonAgg,
    requestRender,
    rendererRef,
    resolveModeRanges,
    shouldDrawAgg,
    throttledRelativeTsQuery,
  ]);

  const throttledDrawAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      // new agg data may take over spans from non agg
      resolveModeRanges();
      drawAgg();
      requestRender();
    }, [drawAgg, requestRender, resolveModeRanges]),
    50,
    { leading: false, trailing: true },
  );

  const throttledDrawNonAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange) return;

      const { nonAgg } = resolveModeRanges();
      if (nonAgg.length) moveCameraAndDrawNonAgg(visibleRange);
      if (shouldDrawAggAfterNonAgg()) drawAgg();
      requestRender();
    }, [
      drawAgg,
      moveCameraAndDrawNonAgg,
      requestRender,
      resolveModeRanges,
      shouldDrawAggAfterNonAgg,
    ]),
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
    <>
      <div ref={containerRef} className={styles.trackCanvasContainer} />
      <TrackControls
        name={trackNames.shreds}
        bucketSize={granularity}
        trackId="shreds"
        legend={isShredsGranularity(granularity) ? shredLegend : aggShredEvents}
      />
    </>
  );
}

const ShredsTrackWithRemount = withWebGlRemount(ShredsTrack);
export default ShredsTrackWithRemount;
