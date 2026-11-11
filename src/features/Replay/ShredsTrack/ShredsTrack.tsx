import { getDefaultStore } from "jotai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import { useFrameRender } from "../../WebGl/useFrameRender.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import { isAggregate, setUpRenderers } from "./utils.ts";
import {
  drawAggShreds,
  getAggShredCount,
  moveAggCamera,
  resampleEventCounts,
} from "./aggUtils.ts";
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
  useContainerSlotHitTest,
} from "../slotHighlight.ts";
import { updateCameraYRange } from "../../Shreds/WebGl/drawUtils.ts";
import ShredsYAxis from "./ShredsYAxis.tsx";
import {
  AGG_SHREDS_CHART_ID,
  aggShredEvents,
  MAX_HEIGHT_RATIO,
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
import { calcAbsoluteNs, clientXToMs, getBucketIdx } from "../utils.ts";
import { drawEventType } from "../const.ts";
import styles from "../track.module.css";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import TrackControls from "../TrackControls.tsx";
import { trackNames } from "../layout.ts";
import { useHoveredPosition, type HoveredRect } from "../useHoveredPosition.ts";
import { clientYToWorldY, isInRanges } from "../hoverUtils.ts";
import type { DataLevel } from "../coverage.ts";
import { useModeCoverage } from "../useModeCoverage.ts";
import { getDrawnBucket } from "../aggDraw.ts";

const store = getDefaultStore();

function isShredsGranularity(
  granularity: AggGranularity | ShredsGranularity | undefined,
): granularity is ShredsGranularity {
  return (
    granularity === ShredsGranularityEnum.shred ||
    granularity === ShredsGranularityEnum.fec
  );
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
) {
  const { camera, cameraReferenceMs } = renderer.nonAggResources;
  const ts = clientXToMs(clientX, rect, [
    cameraReferenceMs + camera.left,
    cameraReferenceMs + camera.right,
  ]);
  const worldY = clientYToWorldY(rect, clientY, camera.top, camera.bottom);
  return getShredAtPosition(ts, worldY, renderer.nonAggResources);
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

interface ShredsTrackProps {
  height: number;
}

interface ShredsTrackBodyProps extends ShredsTrackProps, WebGlRemountProps {}

function ShredsTrackBody({ remount, height }: ShredsTrackBodyProps) {
  const [granularity, setGranularity] = useState<
    AggGranularity | ShredsGranularity | undefined
  >(undefined);
  const [axisMax, setAxisMax] = useState(0);
  const aggMaxRef = useRef(0);
  const isAggDataChangedRef = useRef(false);
  const nonAggMaxRef = useRef(0);

  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderers(setUpContextListeners, getWasContextLost),
    onResize: () => redraw(),
  });

  const {
    query: aggQuery,
    granularityLevels: aggLevels,
    getDrawTiles,
    pauseStaleRefreshes: pauseStaleAggRefreshes,
  } = useAggShredsQuery(AGG_SHREDS_CHART_ID);

  // Mark meshes for slots whose data was just refetched, so the next draw
  // redraws them in place. Freeing them here instead would leave a gap: a
  // render already queued for this frame would draw the scene without them.
  const markMeshesStale = useCallback(
    (granularity: ShredsGranularity, slotNumbers: number[]) => {
      if (!rendererRef.current || !slotNumbers.length) return;
      // keep recorded edges so hit-testing matches the drawn bars until the redraw
      const { staleMeshKeys } = rendererRef.current.nonAggResources;
      for (const slotNumber of slotNumbers) {
        staleMeshKeys.add(getSlotMeshKey(granularity, slotNumber));
      }
    },
    [rendererRef],
  );

  const {
    query: nonAggQuery,
    granularityLevels: nonAggLevels,
    pauseStaleRefreshes: pauseStaleNonAggRefreshes,
  } = useNonAggShredsQuery(NON_AGG_SHREDS_CHART_ID, markMeshesStale);

  const granularityLevels = useMemo<DataLevel[]>(
    () => [...aggLevels, ...nonAggLevels],
    [aggLevels, nonAggLevels],
  );

  const {
    modeRangesRef,
    resolveModeRanges,
    startAggDraw,
    shouldDrawAgg,
    renderModes,
  } = useModeCoverage({
    granularityLevels,
    getTargetGranularity,
    getAggGranularity,
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

      const ts = clientXToMs(clientX, rect, visibleRange);
      // show the tooltip of the mode drawn under the cursor
      const { agg, nonAgg } = modeRangesRef.current;
      const isAgg = isInRanges(agg, ts);
      if (!isAgg && !isInRanges(nonAgg, ts)) {
        clearHoveredShred();
        clearHoveredAggShreds();
        return;
      }

      if (isAgg) {
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
        const counts = getDrawnBucket(
          getDrawTiles,
          granularity,
          bucketIdx,
          store.get(aggShredsAtom),
          resampleEventCounts,
        );
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
        getShredAtPoint(renderer, clientX, clientY, rect),
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

  const throttledRelativeTsQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      if (isAggregate(visibleRange)) {
        pauseStaleNonAggRefreshes();
        const queryGranularity = getAggGranularity(
          visibleRange[1] - visibleRange[0],
        );
        aggQuery(
          referenceNs,
          visibleRange,
          worldRange,
          queryGranularity,
          granularityLevels,
        );
        setGranularity(queryGranularity);
      } else {
        pauseStaleAggRefreshes();
        const queryGranularity = getNonAggGranularity(
          visibleRange[1] - visibleRange[0],
        );
        nonAggQuery(
          referenceNs,
          visibleRange,
          worldRange,
          queryGranularity,
          granularityLevels,
        );
        setGranularity(queryGranularity);
      }
    },
    100,
    { leading: true, trailing: true },
  );

  /**
   * Scale the modes drawn to the axis max, shared if both are drawn. An empty
   * draw keeps the previous scale instead of collapsing.
   */
  const applyAxisMax = useCallback(() => {
    if (!rendererRef.current) return;
    const { aggResources, nonAggResources } = rendererRef.current;
    const { agg, nonAgg } = modeRangesRef.current;
    const max = Math.max(
      agg.length ? aggMaxRef.current : 0,
      nonAgg.length ? nonAggMaxRef.current : 0,
    );
    if (max <= 0) return;

    if (agg.length) {
      updateCameraYRange(aggResources.camera, max / MAX_HEIGHT_RATIO);
    }
    if (nonAgg.length) {
      updateCameraYRange(nonAggResources.camera, max / MAX_HEIGHT_RATIO);
    }
    setAxisMax(max);
  }, [rendererRef, modeRangesRef]);

  const renderActive = useCallback(() => {
    if (!rendererRef.current) return;
    const { renderer, aggResources, nonAggResources } = rendererRef.current;
    const visibleRange = store.get(visibleRangeAtom);
    if (!visibleRange) return;

    applyAxisMax();

    if (!modeRangesRef.current.nonAgg.length) {
      // renderer will replace scene, so clear last draw info
      nonAggResources.lastDrawInfo = undefined;
      // clear highlight so it won't reappear when non agg is drawn again
      drawHoveredShred(nonAggResources, undefined, visibleRange);
      clearHoveredShred();
      renderer.render(aggResources.scene, aggResources.camera);
      return;
    }

    updateSlotHighlight(nonAggResources.highlight, renderer.domElement.width);
    updateSlotMeshes(nonAggResources);
    nonAggResources.smoothPass.renderToTarget(
      renderer,
      nonAggResources.scene,
      nonAggResources.camera,
    );
    renderModes(renderer, aggResources, nonAggResources.smoothPass.output);
  }, [rendererRef, modeRangesRef, renderModes, applyAxisMax]);

  const requestRender = useFrameRender(renderActive);
  useSlotHighlightRender(requestRender);

  useContainerSlotHitTest(containerRef, (clientX, clientY, rect) => {
    const renderer = rendererRef.current;
    const visibleRange = store.get(visibleRangeAtom);
    if (
      !renderer ||
      !visibleRange ||
      !isInRanges(
        modeRangesRef.current.nonAgg,
        clientXToMs(clientX, rect, visibleRange),
      )
    ) {
      return;
    }

    return getShredAtPoint(renderer, clientX, clientY, rect)?.slot;
  });

  // the selected slot draws on top, so the shred under a still cursor can change
  useEffect(() => store.sub(selectedSlotAtom, notifyHover), [notifyHover]);

  const moveCameraAndDrawNonAgg = useCallback(
    (visibleRange: TsRange) => {
      if (!rendererRef.current) return;

      const referenceNs = store.get(referenceNsAtom);
      const worldRange = store.get(worldRangeAtom);
      if (referenceNs == null || !worldRange) return;

      moveNonAggCamera(
        rendererRef.current.nonAggResources,
        visibleRange,
        rendererRef.current.renderer.domElement.width,
      );
      const granularity = getNonAggGranularity(
        visibleRange[1] - visibleRange[0],
      );

      const max = drawNonAggShreds(
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

      nonAggMaxRef.current = max;
      applyAxisMax();
      requestRender();
      notifyHover();
    },
    [requestRender, notifyHover, rendererRef, applyAxisMax],
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
    isAggDataChangedRef.current = false;

    const max = drawAggShreds(
      rendererRef.current,
      aggDraw.referenceNs,
      aggDraw.visibleRange,
      store.get(aggShredsAtom),
      aggDraw.granularity,
      aggDraw.getDrawTiles,
    );
    aggMaxRef.current = max;
    applyAxisMax();
  }, [rendererRef, startAggDraw, applyAxisMax]);

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

    const { agg, nonAgg } = resolveModeRanges();
    if ((isAggDataChangedRef.current && agg.length) || shouldDrawAgg()) {
      drawAgg();
    }
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
      const { agg } = resolveModeRanges();
      // redraw once an agg span is drawn
      if (!agg.length) {
        isAggDataChangedRef.current = true;
        return;
      }
      drawAgg();
      requestRender();
      notifyHover();
    }, [drawAgg, requestRender, resolveModeRanges, notifyHover]),
    50,
    { leading: false, trailing: true },
  );

  const throttledDrawNonAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange) return;

      const { agg, nonAgg } = resolveModeRanges();
      if (nonAgg.length) moveCameraAndDrawNonAgg(visibleRange);
      if ((isAggDataChangedRef.current && agg.length) || shouldDrawAgg()) {
        drawAgg();
      }
      requestRender();
    }, [
      drawAgg,
      moveCameraAndDrawNonAgg,
      requestRender,
      resolveModeRanges,
      shouldDrawAgg,
    ]),
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
      <ShredsYAxis maxShreds={axisMax} height={height} />
      <TrackControls
        name={trackNames.shreds}
        bucketSize={granularity}
        trackId="shreds"
        legend={isShredsGranularity(granularity) ? shredLegend : aggShredEvents}
      />
    </>
  );
}

const ShredsTrackWithRemount = withWebGlRemount(ShredsTrackBody);
export default function ShredsTrack(props: ShredsTrackProps) {
  return <ShredsTrackWithRemount {...props} />;
}
