import { getDefaultStore } from "jotai";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
import { aggTrackHeight, aggTrackOverhang } from "./const.ts";
import type { useAggHeaderQuery } from "./useAggHeaderQuery.ts";
import { getAggSlotsGranularity } from "../utils.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import clsx from "clsx";
import styles from "../track.module.css";
import {
  aggHeaderEmitterAtom,
  aggSlotsAtom,
  isAggHeaderVisibleAtom,
} from "./aggAtoms.ts";
import { dataChangeEventType, drawEventType } from "../const.ts";
import TrackControls from "../TrackControls.tsx";
import TrackEventMarkers, {
  EPOCH_LABEL_WIDTH_PX,
} from "../TrackEventMarkers.tsx";
import { TimelineEventType } from "../../../api/entities.ts";
import { epochLabel, useGetEpochForSlot } from "../../../epochUtils.ts";
import {
  Pin,
  PIN_TRIANGLE_HEIGHT_PX,
  PIN_TRIANGLE_PATH,
  PIN_TRIANGLE_WIDTH_PX,
} from "../MiniMap/EventsTrack/Pin.tsx";
import trackEventPinsStyles from "../trackEventPins.module.css";
import { Box } from "@radix-ui/themes";
import { epochSkippedSlotColor } from "../../../colors.ts";
import { useModeCoverage } from "../useModeCoverage.ts";

const store = getDefaultStore();

// half the 10px pin icon, centered on its ts
const PIN_RADIUS_PX = 5;
const skippedPinCullMarginPx = { left: PIN_RADIUS_PX, right: PIN_RADIUS_PX };
const epochPinCullMarginPx = {
  left: EPOCH_LABEL_WIDTH_PX,
  right: PIN_RADIUS_PX,
};

const pinIconStyle = {
  // 1px into the header's top margin
  top: -(aggTrackOverhang + 1),
  // ends at the track bottom
  height: `calc(100% + ${aggTrackOverhang + 1}px)`,
};

// The same pin as epoch starts, without a label, drawn by one element (styled by
// skipped-pin) instead of Pin's 8. The triangle is Pin's svg.
const skippedPinTriangleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_TRIANGLE_WIDTH_PX}" height="${PIN_TRIANGLE_HEIGHT_PX}" viewBox="0 0 ${PIN_TRIANGLE_WIDTH_PX} ${PIN_TRIANGLE_HEIGHT_PX}" fill="none"><path d="${PIN_TRIANGLE_PATH}" fill="${epochSkippedSlotColor}" stroke="black"/></svg>`;
const skippedPinVars = {
  "--skipped-pin-overhang": `${aggTrackOverhang + 1}px`,
  "--skipped-pin-background": [
    `url("data:image/svg+xml,${encodeURIComponent(skippedPinTriangleSvg)}") no-repeat 0 0 / ${PIN_TRIANGLE_WIDTH_PX}px ${PIN_TRIANGLE_HEIGHT_PX}px`,
    // a 2px bar centered under the triangle
    `linear-gradient(${epochSkippedSlotColor}, ${epochSkippedSlotColor}) no-repeat ${PIN_TRIANGLE_WIDTH_PX / 2 - 1}px ${PIN_TRIANGLE_HEIGHT_PX}px / 2px calc(100% - ${PIN_TRIANGLE_HEIGHT_PX}px)`,
  ].join(", "),
} as CSSProperties;

const renderNothing = () => null;

function getTargetGranularity(visibleRange: TsRange): string {
  return getAggSlotsGranularity(visibleRange[1] - visibleRange[0]);
}

function isAggDrawn(visibleRange: TsRange) {
  return isAggregate(visibleRange) || store.get(isAggHeaderVisibleAtom);
}

interface AggHeaderTrackProps extends WebGlRemountProps {
  className: string;
  aggQuery: ReturnType<typeof useAggHeaderQuery>;
}

function AggHeaderTrack({
  remount,
  className,
  aggQuery: { query: aggQuery, granularityLevels, pauseStaleRefreshes },
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

  const { resolveModeRanges, startAggDraw, shouldDrawAgg } = useModeCoverage({
    granularityLevels,
    getTargetGranularity,
    getAggGranularity: getAggSlotsGranularity,
  });
  // whether the agg data changed since the mesh was drawn
  const isDataChangedRef = useRef(true);

  const throttledRelativeTsQuery = useThrottledCallbackIfVisible(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      if (isAggregate(visibleRange)) {
        const queryGranularity = getAggSlotsGranularity(
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
   * Render if agg is shown
   */
  const render = useCallback(() => {
    if (!rendererRef.current || !store.get(isAggHeaderVisibleAtom)) return;

    const { renderer, aggResources } = rendererRef.current;
    const { camera, scene } = aggResources;
    renderer.render(scene, camera);
  }, [rendererRef]);

  const drawAgg = useCallback(() => {
    const aggDraw = startAggDraw();
    if (!rendererRef.current || !aggDraw) return;
    isDataChangedRef.current = false;

    drawAggSlots(
      rendererRef.current,
      aggDraw.referenceNs,
      aggDraw.visibleRange,
      store.get(aggSlotsAtom),
      aggDraw.getDrawTiles,
    );
    render();
  }, [rendererRef, render, startAggDraw]);

  const throttledDrawAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const visibleRange = store.get(visibleRangeAtom);
      if (!visibleRange || !isAggDrawn(visibleRange)) return;
      resolveModeRanges();
      // draw events also fire when panning to fetched data
      if (isDataChangedRef.current || shouldDrawAgg()) drawAgg();
    }, [drawAgg, resolveModeRanges, shouldDrawAgg]),
    50,
    { leading: true, trailing: true },
  );

  /**
   * Update camera and query data for a new range. Redraw only if the view left
   * the drawn buckets or the granularity they're drawn from changed.
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
    if (!isAggDrawn(visibleRange)) return;
    resolveModeRanges();
    if (isDataChangedRef.current || shouldDrawAgg()) drawAgg();
    else render();
  }, [
    render,
    drawAgg,
    rendererRef,
    resolveModeRanges,
    shouldDrawAgg,
    throttledRelativeTsQuery,
  ]);

  // subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);
    const unsubscribeShown = store.sub(isAggHeaderVisibleAtom, render);

    // listen for agg slots draw events
    const aggEmitter = store.get(aggHeaderEmitterAtom);
    const onDataChange = () => {
      isDataChangedRef.current = true;
    };
    aggEmitter.addListener(dataChangeEventType, onDataChange);
    aggEmitter.addListener(drawEventType, throttledDrawAgg);

    // trigger initial draw
    onRangeChange();

    // cleanup
    return () => {
      aggEmitter.removeListener(dataChangeEventType, onDataChange);
      aggEmitter.removeListener(drawEventType, throttledDrawAgg);
      throttledDrawAgg.cancel();
      throttledRelativeTsQuery.cancel();
      unsubscribeShown();
      unsubscribeRange();
    };
  }, [onRangeChange, render, throttledDrawAgg, throttledRelativeTsQuery]);

  const getEpochForSlot = useGetEpochForSlot();
  const renderEpochPin = useCallback(
    (slot: number) => (
      <div className={trackEventPinsStyles.pinContent}>
        <div className={trackEventPinsStyles.pinIcon} style={pinIconStyle}>
          <Pin eventType={TimelineEventType.EpochStart} fullHeightBar />
        </div>
        <span className={trackEventPinsStyles.pinLabel}>
          {epochLabel(getEpochForSlot?.(slot))}
        </span>
      </div>
    ),
    [getEpochForSlot],
  );

  return (
    <Box
      height={`${aggTrackHeight}px`}
      className={clsx(className, styles.trackContainer)}
      style={skippedPinVars}
    >
      <div ref={containerRef} className={styles.trackCanvasContainer} />
      {/* my skipped slots, under the epoch pins */}
      <TrackEventMarkers
        eventType={TimelineEventType.LeaderSkip}
        showIn="agg"
        rootClassName={trackEventPinsStyles.root}
        markerParentClassName={trackEventPinsStyles.skippedPin}
        cullMarginPx={skippedPinCullMarginPx}
        renderMarker={renderNothing}
      />
      <TrackEventMarkers
        eventType={TimelineEventType.EpochStart}
        showIn="agg"
        rootClassName={trackEventPinsStyles.root}
        markerParentClassName={trackEventPinsStyles.pin}
        cullMarginPx={epochPinCullMarginPx}
        renderMarker={renderEpochPin}
      />
      <TrackControls name="Slots" bucketSize={granularity} />
    </Box>
  );
}

const AggHeaderTrackWithRemount = withWebGlRemount(AggHeaderTrack);
export default AggHeaderTrackWithRemount;
