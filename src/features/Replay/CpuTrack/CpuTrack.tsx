import { getDefaultStore, useAtomValue } from "jotai";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import { partition } from "lodash";
import SelectionMarker from "../SelectionMarker.tsx";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import { tilesAtom } from "../../../api/atoms.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import TrackControls, {
  TrackControlsToggle,
  type LegendItem,
} from "../TrackControls.tsx";
import { tileBusyGreenColor, tileBusyRedColor } from "../../../colors.ts";
import { aggCpuAtom, aggCpuEmitterAtom, updateEventType } from "./atoms.ts";
import {
  AGG_CPU_CHART_ID,
  DEFAULT_SELECTED_KINDS,
  getCpuTrackHeight,
  getRowTopPx,
  rowHeightPx,
  type CpuRow,
} from "./const.ts";
import {
  getAggGranularity,
  useAggCpuQuery,
  type AggCpuQuery,
} from "./useAggCpuQuery.ts";
import {
  moveCpuCamera,
  resizeRenderer,
  setRows,
  setUpRenderer,
  syncCpuData,
  updateCpuData,
  type RendererObj,
} from "./cpuRenderer.ts";
import { getCpuRows, getTileKinds } from "./utils.ts";
import trackStyles from "../track.module.css";
import chartStyles from "../chart.module.css";

const store = getDefaultStore();

/** sparklines use an idle to busy gradient rather than a series color */
const legendSwatchColor = `linear-gradient(to top, ${tileBusyGreenColor}, ${tileBusyRedColor})`;

interface CpuTrackBodyProps extends WebGlRemountProps {
  width: number;
  height: number;
  rows: CpuRow[];
  aggQuery: AggCpuQuery;
  setGranularity: (granularity: AggGranularity) => void;
}

function CpuTrackBody({
  remount,
  width,
  height,
  rows,
  aggQuery: { query: aggQuery },
  setGranularity,
}: CpuTrackBodyProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const throttledRelativeTsQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      const queryGranularity = getAggGranularity(
        visibleRange[1] - visibleRange[0],
      );
      aggQuery(referenceNs, visibleRange, worldRange, queryGranularity);
      setGranularity(queryGranularity);
    },
    100,
    { leading: true, trailing: true },
  );

  const render = useCallback(() => {
    if (!rendererRef.current) return;
    const { renderer, scene, camera } = rendererRef.current;
    renderer.render(scene, camera);
  }, []);

  const throttledRender = useThrottledCallbackIfVisible(render, 50, {
    leading: false,
    trailing: true,
  });

  /**
   * Load newly visible buckets into the data texture and point the shader at them
   */
  const syncData = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (!rendererRef.current || !visibleRange || referenceNs == null) return;

    syncCpuData(
      rendererRef.current,
      referenceNs,
      visibleRange,
      store.get(aggCpuAtom),
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

    // only writes buckets entering the view
    moveCpuCamera(rendererRef.current, visibleRange);
    syncData();
    throttledRelativeTsQuery(referenceNs, visibleRange, worldRange);
    render();
  }, [render, syncData, throttledRelativeTsQuery]);

  /**
   * Rewrite only the changed buckets in the data texture
   */
  const onUpdate = useCallback(
    (
      granularity: AggGranularity,
      startBucketIdx: number,
      endBucketIdx: number,
    ) => {
      if (!rendererRef.current) return;

      updateCpuData(
        rendererRef.current,
        granularity,
        startBucketIdx,
        endBucketIdx,
        store.get(aggCpuAtom),
      );
      throttledRender();
    },
    [throttledRender],
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !containerRef.current) return;

    const rendererObj = setUpRenderer(
      0,
      0,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);
    const cleanUpRenderer = rendererObj.cleanUp;
    const emitter = store.get(aggCpuEmitterAtom);
    emitter.addListener(updateEventType, onUpdate);

    // trigger initial draw
    setIsInitialized(true);
    onRangeChange();

    // cleanup
    return () => {
      emitter.removeListener(updateEventType, onUpdate);
      // cancel pending trailing timers so they don't accumulate across remounts
      throttledRelativeTsQuery.cancel();
      throttledRender.cancel();
      unsubscribeRange();
      cleanUpRenderer();
      rendererRef.current = undefined;
    };
  }, [
    onRangeChange,
    onUpdate,
    setUpContextListeners,
    getWasContextLost,
    throttledRender,
    throttledRelativeTsQuery,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    resizeRenderer(rendererRef.current, width, height);
    render();
  }, [render, width, height, isInitialized]);

  // refill the data texture on row layout change
  useLayoutEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    setRows(rendererRef.current, rows);
    syncData();
    render();
  }, [rows, isInitialized, syncData, render]);

  return (
    <div ref={containerRef} className={trackStyles.trackCanvasContainer} />
  );
}

const CpuTrackBodyWithRemount = withWebGlRemount(CpuTrackBody);

interface CpuTrackProps {
  width: number;
}

export default function CpuTrack({ width }: CpuTrackProps) {
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );
  const [splitByTile, setSplitByTile] = useState(false);
  const [selectedKinds, setSelectedKinds] = useState(DEFAULT_SELECTED_KINDS);

  const tiles = useAtomValue(tilesAtom);
  const rows = useMemo(
    () => getCpuRows(tiles, selectedKinds, splitByTile),
    [tiles, selectedKinds, splitByTile],
  );
  const tileKinds = useMemo(() => getTileKinds(tiles), [tiles]);
  // Selected kinds first, set when the controls open so toggling a series
  // doesn't move it under the cursor
  const [legendKinds, setLegendKinds] = useState<string[]>();
  const onControlsOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) return;
      setLegendKinds(
        partition(tileKinds, (kind) => selectedKinds.includes(kind)).flat(),
      );
    },
    [tileKinds, selectedKinds],
  );
  const legend = useMemo<LegendItem[]>(
    () =>
      (legendKinds ?? tileKinds).map((kind) => ({
        label: kind,
        color: legendSwatchColor,
      })),
    [legendKinds, tileKinds],
  );
  const height = getCpuTrackHeight(rows.length);

  const aggQuery = useAggCpuQuery(AGG_CPU_CHART_ID);

  return (
    <div className={trackStyles.trackContainer} style={{ height }}>
      <CpuTrackBodyWithRemount
        width={width}
        height={height}
        rows={rows}
        aggQuery={aggQuery}
        setGranularity={setGranularity}
      />
      <SelectionMarker />
      {/* one label per row, centered vertically, matching the execrp track's row labels */}
      <div className={chartStyles.yAxis}>
        {rows.map(({ key, label }, i) => (
          <div
            key={key}
            className={chartStyles.yAxisTick}
            style={{ top: getRowTopPx(i) + rowHeightPx / 2 }}
          >
            <span className={chartStyles.yAxisTickLabel}>{label}</span>
          </div>
        ))}
      </div>
      <TrackControls
        name="CPU"
        bucketSize={granularity}
        legend={legend}
        legendMultiSelection={{
          values: selectedKinds,
          onChange: setSelectedKinds,
        }}
        onOpenChange={onControlsOpenChange}
      >
        <TrackControlsToggle
          label="Split by tile"
          checked={splitByTile}
          onChange={setSplitByTile}
        />
      </TrackControls>
    </div>
  );
}
