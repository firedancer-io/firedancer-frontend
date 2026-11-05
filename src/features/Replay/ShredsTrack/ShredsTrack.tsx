import { getDefaultStore } from "jotai";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import { useFrameRender } from "../../WebGl/useFrameRender.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import { isAggregate, setUpRenderers } from "./utils.ts";
import { drawAggShreds, getAggShredCount, moveAggCamera } from "./aggUtils.ts";
import {
  drawHoveredShred,
  drawNonAggShreds,
  getNonAggGranularity,
  getSlotMeshKey,
  moveNonAggCamera,
  getShredAtPosition,
  updateSlotMeshes,
} from "./nonAggUtils.ts";
import {
  updateSlotHighlight,
  useSlotHighlightRender,
  useSlotHitTest,
} from "../slotHighlight.ts";
import { releaseMesh } from "../../Shreds/WebGl/drawUtils.ts";
import {
  AGG_SHREDS_CHART_ID,
  aggShredEvents,
  NON_AGG_SHREDS_CHART_ID,
  shredLegend,
  type RendererObj,
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
  hoveredAggShredsAtom,
  hoveredShredAtom,
  referenceNsAtom,
  selectedSlotAtom,
  visibleRangeAtom,
  worldRangeAtom,
} from "../atoms.ts";
import { calcAbsoluteNs, getBucketIdx } from "../utils.ts";
import styles from "../track.module.css";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import TrackControls from "../TrackControls.tsx";
import { trackNames } from "../layout.ts";
import { useHoveredPosition, type HoveredRect } from "../useHoveredPosition.ts";

const store = getDefaultStore();

function isShredsGranularity(
  granularity: AggGranularity | ShredsGranularity | undefined,
): granularity is ShredsGranularity {
  return (
    granularity === ShredsGranularityEnum.shred ||
    granularity === ShredsGranularityEnum.fec
  );
}

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

function getShredAtPoint(
  renderer: RendererObj,
  clientX: number,
  clientY: number,
  rect: HoveredRect,
  visibleRange: TsRange,
) {
  const ts = clientXToTs(rect, clientX, visibleRange);
  const { camera } = renderer.nonAggResources;
  const worldY = clientYToWorldY(rect, clientY, camera.top, camera.bottom);
  return getShredAtPosition(ts, worldY, renderer.nonAggResources);
}

function ShredsTrack({ remount }: WebGlRemountProps) {
  const [granularity, setGranularity] = useState<
    AggGranularity | ShredsGranularity | undefined
  >(undefined);

  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderers(setUpContextListeners, getWasContextLost),
    onResize: () => redrawActive(),
  });

  /**
   * throttle shred hit-test
   */
  const throttledResolveHoverShred = useThrottledCallback(
    (clientX: number, clientY: number, rect: HoveredRect) => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      const visibleRange = store.get(visibleRangeAtom);
      const referenceNs = store.get(referenceNsAtom);
      if (!visibleRange || referenceNs == null) {
        clearHoveredShred();
        clearHoveredAggShreds();
        return;
      }

      const ts = clientXToTs(rect, clientX, visibleRange);

      if (isAggregate(visibleRange)) {
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
        const bucketHeight = getAggShredCount(counts);

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
        return;
      }

      clearHoveredAggShreds();
      store.set(
        hoveredShredAtom,
        getShredAtPoint(renderer, clientX, clientY, rect, visibleRange),
      );
    },
    30,
  );

  const onHoverLeave = useCallback(() => {
    throttledResolveHoverShred.cancel();
    clearHoveredShred();
    clearHoveredAggShreds();
  }, [throttledResolveHoverShred]);

  const { setContainer: setHoverContainer, notifyChange: notifyHover } =
    useHoveredPosition({
      onHoverChange: throttledResolveHoverShred,
      onHoverLeave,
    });

  const { query: aggQuery, pauseStaleRefreshes: pauseStaleAggRefreshes } =
    useAggShredsQuery(AGG_SHREDS_CHART_ID);

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
        lastDrawInfo,
      } = rendererRef.current.nonAggResources;
      for (const slotNumber of slotNumbers) {
        const key = getSlotMeshKey(granularity, slotNumber);
        releaseMesh(scene, meshes, availableMeshes, key);
        releaseMesh(scene, edgeMeshes, availableEdgeMeshes, key);
        // drop the recorded edge so the rebuilt mesh re-records against the
        // current draw edge instead of reusing the stale one
        lastDrawInfo?.incompleteRightEdges.delete(key);
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

    if (isAggregate(visibleRange)) {
      // renderer will replace scene, so clear last draw info
      nonAggResources.lastDrawInfo = undefined;
      // clear highlight so it won't reappear when we return to non-agg
      drawHoveredShred(nonAggResources, undefined, visibleRange);
      clearHoveredShred();
      renderer.render(aggResources.scene, aggResources.camera);
      return;
    }

    updateSlotHighlight(nonAggResources.highlight, renderer.domElement.width);
    updateSlotMeshes(nonAggResources);
    renderer.render(nonAggResources.scene, nonAggResources.camera);
  }, [rendererRef]);

  const requestRender = useFrameRender(renderActive);
  useSlotHighlightRender(requestRender);

  useSlotHitTest((clientX, clientY) => {
    const renderer = rendererRef.current;
    const container = containerRef.current;
    const visibleRange = store.get(visibleRangeAtom);
    if (!renderer || !container || !visibleRange || isAggregate(visibleRange))
      return;

    const rect = container.getBoundingClientRect();
    const isInside =
      rect.left <= clientX &&
      clientX <= rect.right &&
      rect.top <= clientY &&
      clientY <= rect.bottom;
    if (!isInside) return;
    return getShredAtPoint(renderer, clientX, clientY, rect, visibleRange)
      ?.slot;
  });

  // the selected slot draws on top, so the shred under a still cursor can change
  useEffect(() => store.sub(selectedSlotAtom, notifyHover), [notifyHover]);

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
      notifyHover();
    },
    [requestRender, notifyHover, rendererRef],
  );

  // Redraw the currently-active view without refetching
  const redrawActive = useCallback(() => {
    const visibleRange = store.get(visibleRangeAtom);
    if (!visibleRange) return;
    if (isAggregate(visibleRange)) {
      // agg has no size-dependent uniforms, so a plain render suffices
      requestRender();
    } else {
      moveCameraAndDrawNonAgg(visibleRange);
    }
  }, [moveCameraAndDrawNonAgg, requestRender]);

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
      requestRender();
    } else {
      throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);
      // trigger a redraw immediately to hide trailing incomplete slots and prevent extended shreds.
      moveCameraAndDrawNonAgg(visibleRange);
    }
  }, [
    moveCameraAndDrawNonAgg,
    requestRender,
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
      requestRender();
      notifyHover();
    }, [requestRender, notifyHover, rendererRef]),
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

    const unsubscribeHover = store.sub(hoveredShredAtom, () => {
      if (!rendererRef.current) return;
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange) return;

      if (isAggregate(visibleRange)) {
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
    rendererRef,
    containerRef,
    requestRender,
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
