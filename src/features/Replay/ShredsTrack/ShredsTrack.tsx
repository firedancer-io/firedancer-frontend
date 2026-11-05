import { getDefaultStore } from "jotai";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import { useFrameRender } from "../../WebGl/useFrameRender.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import { isAggregate, setUpRenderers } from "./utils.ts";
import { drawAggShreds, moveAggCamera } from "./aggUtils.ts";
import {
  drawHoveredShred,
  drawNonAggShreds,
  getNonAggGranularity,
  getSlotMeshKey,
  moveNonAggCamera,
  getShredAtPosition,
  orderSlotMeshes,
} from "./nonAggUtils.ts";
import {
  updateSlotHighlight,
  useSlotHighlightRender,
} from "../slotHighlight.ts";
import { releaseMesh } from "../../Shreds/WebGl/drawUtils.ts";
import ShredsYAxis from "./ShredsYAxis.tsx";
import {
  AGG_SHREDS_CHART_ID,
  aggShredEvents,
  MAX_HEIGHT_RATIO,
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
import {
  clearHoverInfoAtom,
  hoveredAggShredsAtom,
  hoveredShredAtom,
  isPinnedAtom,
  referenceNsAtom,
  setHoverInfoAtom,
  visibleRangeAtom,
  worldRangeAtom,
} from "../atoms.ts";
import { calcAbsoluteNs, getBucketIdx } from "../utils.ts";
import styles from "../track.module.css";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import TrackControls from "../TrackControls.tsx";
import { trackNames } from "../layout.ts";
import { useHoveredPosition, type HoveredRect } from "../useHoveredPosition.ts";
import { OVERSCAN_BUCKETS, resolveHeldDraw } from "../useAggQuery.ts";
import { msBucketSizes } from "../const.ts";

const store = getDefaultStore();

function isShredsGranularity(
  granularity: AggGranularity | ShredsGranularity | undefined,
): granularity is ShredsGranularity {
  return (
    granularity === ShredsGranularityEnum.shred ||
    granularity === ShredsGranularityEnum.fec
  );
}

const SHREDS_HOVER_OWNER = "replay-shreds";

function clientXToTs(rect: HoveredRect, clientX: number, range: TsRange) {
  const fraction = (clientX - rect.left) / rect.width;
  return range[0] + fraction * (range[1] - range[0]);
}

/**
 * Map a clientY to a camera-space world Y. The camera spans [`cameraTop` (top),
 * `cameraBottom` (= -maxShreds, bottom)], matching the drawn rects' Y.
 */
function clientYToWorldY(
  rect: HoveredRect,
  clientY: number,
  cameraTop: number,
  cameraBottom: number,
) {
  const fraction = (clientY - rect.top) / rect.height;
  return cameraTop + fraction * (cameraBottom - cameraTop);
}

function clearHoveredShred() {
  store.set(hoveredShredAtom, undefined);
}

function clearHoveredAggShreds() {
  store.set(hoveredAggShredsAtom, undefined);
}

function ShredsTrack({ remount }: WebGlRemountProps) {
  const [granularity, setGranularity] = useState<
    AggGranularity | ShredsGranularity | undefined
  >(undefined);
  const [maxShreds, setMaxShreds] = useState(0);

  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderers(setUpContextListeners, getWasContextLost),
    onResize: () => renderActive(),
  });

  /** whether agg is drawn; may lag the visible range while data loads */
  const drawnIsAggRef = useRef<boolean>();

  /**
   * throttle shred hit-test
   */
  const resolveHoveredShred = useThrottledCallback(
    (clientX: number, clientY: number, rect: HoveredRect) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      // while the overlap tooltip is pinned, it owns the spotlight/tooltip
      if (store.get(isPinnedAtom)) return;

      const visibleRange = store.get(visibleRangeAtom);
      const referenceNs = store.get(referenceNsAtom);
      if (!visibleRange || referenceNs == null) {
        clearHoveredShred();
        clearHoveredAggShreds();
        store.set(clearHoverInfoAtom, SHREDS_HOVER_OWNER);
        return;
      }

      const ts = clientXToTs(rect, clientX, visibleRange);

      if (drawnIsAggRef.current ?? isAggregate(visibleRange)) {
        clearHoveredShred();
        const granularity = getAggGranularity(
          visibleRange[1] - visibleRange[0],
        );
        const bucketIdx = getBucketIdx(
          calcAbsoluteNs(referenceNs, ts),
          granularity,
          false,
        );
        // total stacked height of the bucket's bar, in shred count
        const counts = store
          .get(aggShredsAtom)
          .get(granularity)
          ?.get(bucketIdx);
        const bucketHeight = counts
          ? aggShredEvents.reduce(
              (sum, { type }) => sum + (counts[type] ?? 0),
              0,
            )
          : 0;

        // bars span world Y [-bucketHeight, 0]; only show the tooltip when the
        // cursor is actually within the drawn bar
        const { camera } = renderer.aggResources;
        const worldY = clientYToWorldY(
          rect,
          clientY,
          camera.top,
          camera.bottom,
        );
        const onBar =
          counts != null &&
          bucketHeight > 0 &&
          worldY <= 0 &&
          -worldY <= bucketHeight;

        if (onBar) {
          store.set(hoveredAggShredsAtom, {
            bucketIdx,
            granularity,
            counts,
          });
        } else {
          clearHoveredAggShreds();
        }
        store.set(setHoverInfoAtom, {
          owner: SHREDS_HOVER_OWNER,
          cursorMs: ts,
          clientPos: { x: clientX, y: clientY },
        });
        return;
      }

      clearHoveredAggShreds();
      const { camera } = renderer.nonAggResources;
      const worldY = clientYToWorldY(rect, clientY, camera.top, camera.bottom);
      const hitShred = getShredAtPosition(ts, worldY, renderer.nonAggResources);

      store.set(hoveredShredAtom, hitShred);
      store.set(setHoverInfoAtom, {
        owner: SHREDS_HOVER_OWNER,
        cursorMs: ts,
        clientPos: { x: clientX, y: clientY },
        slot: hitShred?.slot,
      });
    },
    30,
  );

  const onHoverChange = useCallback(
    (clientX: number, clientY: number, rect: HoveredRect) => {
      // while the overlap tooltip is pinned, it owns the spotlight/tooltip
      if (store.get(isPinnedAtom)) return;

      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange) return;

      const cursorMs = clientXToTs(rect, clientX, visibleRange);
      // use previous value until the next throttled setter fires
      const slot = store.get(hoveredShredAtom)?.slot;
      store.set(setHoverInfoAtom, {
        owner: SHREDS_HOVER_OWNER,
        cursorMs,
        clientPos: { x: clientX, y: clientY },
        slot,
      });

      resolveHoveredShred(clientX, clientY, rect);
    },
    [resolveHoveredShred],
  );

  const onHoverLeave = useCallback(() => {
    resolveHoveredShred.cancel();
    clearHoveredShred();
    clearHoveredAggShreds();
    store.set(clearHoverInfoAtom, SHREDS_HOVER_OWNER);
  }, [resolveHoveredShred]);

  const {
    setContainer: setHoverContainer,
    refreshContainerAndNotify: refreshHover,
  } = useHoveredPosition({
    onHoverChange,
    onHoverLeave,
  });

  const {
    query: aggQuery,
    getDrawTiles,
    isVisibleDrawable: isAggVisibleDrawable,
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
        dotMeshes,
        availableDotMeshes,
        lastDrawInfo,
      } = rendererRef.current.nonAggResources;
      for (const slotNumber of slotNumbers) {
        const key = getSlotMeshKey(granularity, slotNumber);
        releaseMesh(scene, meshes, availableMeshes, key);
        releaseMesh(scene, dotMeshes, availableDotMeshes, key);
        // drop the recorded edge so the rebuilt mesh re-records against the
        // current draw edge instead of reusing the stale one
        lastDrawInfo?.incompleteRightEdges.delete(key);
      }
    },
    [rendererRef],
  );

  const {
    query: nonAggQuery,
    isVisibleDrawable: isNonAggVisibleDrawable,
    pauseStaleRefreshes: pauseStaleNonAggRefreshes,
  } = useNonAggShredsQuery(NON_AGG_SHREDS_CHART_ID, resetMeshes);

  /**
   * Whether to draw agg or non agg. Keep the previous mode on a mode change
   * until the new mode can draw all of the visible range.
   */
  const resolveIsAgg = useCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      const isAgg = resolveHeldDraw(
        drawnIsAggRef.current,
        isAggregate(visibleRange),
        (agg) =>
          agg
            ? isAggVisibleDrawable(referenceNs, visibleRange, worldRange)
            : isNonAggVisibleDrawable(referenceNs, visibleRange, worldRange),
      );
      drawnIsAggRef.current = isAgg;
      return isAgg;
    },
    [isAggVisibleDrawable, isNonAggVisibleDrawable],
  );

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

    const isAgg = drawnIsAggRef.current ?? isAggregate(visibleRange);
    if (isAgg) {
      // renderer will replace scene, so clear last draw info
      nonAggResources.lastDrawInfo = undefined;
      // clear highlight so it won't reappear when we return to non-agg
      drawHoveredShred(nonAggResources, undefined, visibleRange);
      clearHoveredShred();
      renderer.render(aggResources.scene, aggResources.camera);
      return;
    }

    updateSlotHighlight(nonAggResources.highlight, renderer.domElement.width);
    orderSlotMeshes(nonAggResources);
    renderer.render(nonAggResources.scene, nonAggResources.camera);
  }, [rendererRef]);

  const requestRender = useFrameRender(renderActive);
  useSlotHighlightRender(requestRender);

  const syncYAxis = useThrottledCallback(
    () => {
      const renderer = rendererRef.current;
      const visibleRange = store.get(visibleRangeAtom);
      if (!renderer || !visibleRange) return;

      const { camera } =
        (drawnIsAggRef.current ?? isAggregate(visibleRange))
          ? renderer.aggResources
          : renderer.nonAggResources;
      const extent = -camera.bottom;
      // a real draw pads to >= 1 shred / MAX_HEIGHT_RATIO
      // less means uninitialized
      setMaxShreds(extent < 1 / MAX_HEIGHT_RATIO ? 0 : extent);
    },
    80,
    { leading: true, trailing: true },
  );

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

      drawHoveredShred(
        rendererRef.current.nonAggResources,
        store.get(hoveredShredAtom),
        visibleRange,
      );

      requestRender();
      refreshHover();
      syncYAxis();
    },
    [requestRender, rendererRef, refreshHover, syncYAxis],
  );

  /** granularity and ms range covered by the agg mesh, including overscan */
  const drawnAggRef = useRef<{ granularity: AggGranularity; range: TsRange }>();

  const drawAgg = useCallback(
    (referenceNs: bigint, visibleRange: TsRange) => {
      if (!rendererRef.current) return;
      const granularity = getAggGranularity(visibleRange[1] - visibleRange[0]);
      drawAggShreds(
        rendererRef.current,
        referenceNs,
        visibleRange,
        store.get(aggShredsAtom),
        granularity,
        getDrawTiles,
      );
      const overscanMs = OVERSCAN_BUCKETS * msBucketSizes[granularity];
      drawnAggRef.current = {
        granularity,
        range: [visibleRange[0] - overscanMs, visibleRange[1] + overscanMs],
      };
    },
    [rendererRef, getDrawTiles],
  );

  /**
   * Whether the agg mesh was drawn at a different granularity or doesn't
   * cover the visible range
   */
  const isAggMeshOutdated = useCallback((visibleRange: TsRange) => {
    const drawn = drawnAggRef.current;
    return (
      !drawn ||
      drawn.granularity !==
        getAggGranularity(visibleRange[1] - visibleRange[0]) ||
      visibleRange[0] < drawn.range[0] ||
      visibleRange[1] > drawn.range[1]
    );
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

    // Move camera before querying, because query may trigger immediate draw if data is already available.
    // Always move the agg camera, since agg may stay drawn after zooming into non agg
    moveAggCamera(rendererRef.current.aggResources, visibleRange);
    throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);

    if (resolveIsAgg(referenceNs, visibleRange, worldRange)) {
      // redraw from cache immediately if the mesh is from a previous
      // granularity or range, since the draw event waits on a query round trip.
      // Otherwise moving the camera is enough, e.g. on live frames
      if (isAggMeshOutdated(visibleRange)) drawAgg(referenceNs, visibleRange);
      requestRender();
      syncYAxis();
    } else {
      // trigger a redraw immediately to hide trailing incomplete slots and prevent extended shreds.
      moveCameraAndDrawNonAgg(visibleRange);
    }
  }, [
    drawAgg,
    isAggMeshOutdated,
    moveCameraAndDrawNonAgg,
    requestRender,
    rendererRef,
    resolveIsAgg,
    syncYAxis,
    throttledRelativeTsQuery,
  ]);

  const throttledDrawAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      const worldRange = store.get(worldRangeAtom);
      if (!visibleRange || !worldRange || referenceNs == null) return;

      drawAgg(referenceNs, visibleRange);

      // update the agg mesh even if non agg is still drawn, so it's ready on switch
      if (!resolveIsAgg(referenceNs, visibleRange, worldRange)) return;
      requestRender();
      refreshHover();
      syncYAxis();
    }, [requestRender, drawAgg, resolveIsAgg, refreshHover, syncYAxis]),
    50,
    { leading: false, trailing: true },
  );

  const throttledDrawNonAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      const worldRange = store.get(worldRangeAtom);
      if (
        !rendererRef.current ||
        !visibleRange ||
        !worldRange ||
        referenceNs == null ||
        resolveIsAgg(referenceNs, visibleRange, worldRange)
      )
        return;

      moveCameraAndDrawNonAgg(visibleRange);
    }, [moveCameraAndDrawNonAgg, rendererRef, resolveIsAgg]),
    50,
    { leading: false, trailing: true },
  );

  // subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);

    const unsubscribeHover = store.sub(hoveredShredAtom, () => {
      if (!rendererRef.current) return;
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange) return;

      if (drawnIsAggRef.current ?? isAggregate(visibleRange)) {
        drawHoveredShred(
          rendererRef.current.nonAggResources,
          undefined,
          visibleRange,
        );
        return;
      }

      drawHoveredShred(
        rendererRef.current.nonAggResources,
        store.get(hoveredShredAtom),
        visibleRange,
      );
      requestRender();
    });

    // listen for agg shreds draw events
    const aggEmitter = store.get(aggShredsEmitterAtom);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

    // listen for non-agg shreds draw events (one emitter per granularity)
    const shredEmitter = store.get(timelineShredsAtoms.emitter);
    const fecEmitter = store.get(timelineFecShredsAtoms.emitter);

    shredEmitter.addListener(drawEventType, throttledDrawNonAgg);
    fecEmitter.addListener(drawEventType, throttledDrawNonAgg);

    setHoverContainer(containerRef.current);

    // trigger initial draw
    onRangeChange();

    // cleanup
    return () => {
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
      shredEmitter.removeListener(drawEventType, throttledDrawNonAgg);
      fecEmitter.removeListener(drawEventType, throttledDrawNonAgg);
      setHoverContainer(null);
      onHoverLeave();
      throttledRelativeTsQuery.cancel();
      throttledDrawAgg.cancel();
      throttledDrawNonAgg.cancel();
      syncYAxis.cancel();
      unsubscribeRange();
      unsubscribeHover();
    };
  }, [
    onRangeChange,
    throttledDrawAgg,
    throttledDrawNonAgg,
    throttledRelativeTsQuery,
    setHoverContainer,
    onHoverLeave,
    requestRender,
    syncYAxis,
    containerRef,
    rendererRef,
  ]);

  return (
    <>
      <div ref={containerRef} className={styles.trackCanvasContainer} />
      <ShredsYAxis maxShreds={maxShreds} />
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
