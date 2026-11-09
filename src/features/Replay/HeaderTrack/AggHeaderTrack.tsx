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
import { aggTrackHeight, aggTrackOverhang } from "./const.ts";
import { useAggHeaderQuery } from "./useAggHeaderQuery.ts";
import { getAggSlotsGranularity } from "../utils.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import clsx from "clsx";
import styles from "../track.module.css";
import { aggHeaderEmitterAtom, aggSlotsAtom } from "./aggAtoms.ts";
import { drawEventType } from "../const.ts";
import TrackControls from "../TrackControls.tsx";
import EpochMarkers from "../EpochMarkers.tsx";
import { TimelineEventType } from "../../../api/entities.ts";
import { epochLabel } from "../../../epochUtils.ts";
import { Pin } from "../MiniMap/EventsTrack/Pin.tsx";
import epochPinsStyles from "../epochPins.module.css";
import { Box } from "@radix-ui/themes";

const chartId = "agg-header-track";
const store = getDefaultStore();

interface AggHeaderTrackProps extends WebGlRemountProps {
  className: string;
  showAgg: () => void;
}

function AggHeaderTrack({ remount, className, showAgg }: AggHeaderTrackProps) {
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );
  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderers(setUpContextListeners, getWasContextLost),
    onResize: () => renderIfActive(),
  });

  const { query: aggQuery, pauseStaleRefreshes } = useAggHeaderQuery(chartId);

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

  const renderIfActive = useCallback(() => {
    if (!rendererRef.current) return;

    const visibleRange = store.get(visibleRangeAtom);
    if (!visibleRange || !isAggregate(visibleRange)) return;

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
    if (
      referenceNs == null ||
      !visibleRange ||
      !worldRange ||
      !isAggregate(visibleRange)
    ) {
      return;
    }

    // Move camera before querying, because query may trigger immediate draw if data is already available
    moveAggCamera(rendererRef.current.aggResources, visibleRange);
    throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);
    renderIfActive();
  }, [renderIfActive, rendererRef, throttledRelativeTsQuery]);

  const throttledDrawAgg = useThrottledCallbackIfVisible(
    useCallback(() => {
      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      const aggSlots = store.get(aggSlotsAtom);
      if (
        !rendererRef.current ||
        !visibleRange ||
        referenceNs == null ||
        !isAggregate(visibleRange)
      ) {
        return;
      }

      drawAggSlots(rendererRef.current, referenceNs, visibleRange, aggSlots);
      renderIfActive();
      showAgg();
    }, [rendererRef, renderIfActive, showAgg]),
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

  const renderEpochPin = useCallback(
    (epochNumber: number | undefined) => (
      <div className={epochPinsStyles.pinContent}>
        <div
          className={epochPinsStyles.pinIcon}
          style={{
            // 1px into the header's top margin
            top: -(aggTrackOverhang + 1),
            // ends at the track bottom
            height: `calc(100% + ${aggTrackOverhang + 1}px)`,
          }}
        >
          <Pin eventType={TimelineEventType.EpochStart} fullHeightBar />
        </div>
        <span className={epochPinsStyles.pinLabel}>
          {epochLabel(epochNumber)}
        </span>
      </div>
    ),
    [],
  );

  return (
    <Box
      height={`${aggTrackHeight}px`}
      className={clsx(className, styles.trackContainer)}
    >
      <div ref={containerRef} className={styles.trackCanvasContainer} />
      <EpochMarkers
        rootClassName={epochPinsStyles.root}
        markerParentClassName={epochPinsStyles.pin}
        renderMarker={renderEpochPin}
      />
      <TrackControls name="Slots" bucketSize={granularity} />
    </Box>
  );
}

const AggHeaderTrackWithRemount = withWebGlRemount(AggHeaderTrack);
export default AggHeaderTrackWithRemount;
