import { getDefaultStore, useAtomValue } from "jotai";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import TrackControls, {
  TrackControlsToggle,
  type LegendItem,
} from "../TrackControls.tsx";
import { tileBusyGreenColor, tileBusyRedColor } from "../../../colors.ts";
import {
  aggCpuAtom,
  aggCpuEmitterAtom,
  drawEventType,
  queryTilesAtom,
  queryTilesKeyAtom,
  syncAggCpuTilesAtom,
} from "./atoms.ts";
import {
  AGG_CPU_CHART_ID,
  DEFAULT_SELECTED_KINDS,
  getCpuTrackHeight,
} from "./const.ts";
import {
  getAggGranularity,
  useAggCpuQuery,
  type AggCpuQuery,
} from "./useAggCpuQuery.ts";
import {
  drawCpuData,
  getCpuRows,
  getTileKinds,
  moveCpuCamera,
  resizeRenderer,
  setUpRenderer,
} from "./utils.ts";
import CpuYAxis from "./CpuYAxis.tsx";
import trackStyles from "../track.module.css";

const store = getDefaultStore();

const legendSwatchColor = `linear-gradient(to top, ${tileBusyGreenColor}, ${tileBusyRedColor})`;

interface CpuTrackBodyProps extends WebGlRemountProps {
  query: AggCpuQuery;
  resetQueries: () => void;
}

function CpuTrackBody({ remount, query, resetQueries }: CpuTrackBodyProps) {
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );
  const [splitByTile, setSplitByTile] = useState(false);
  const [selectedKinds, setSelectedKinds] = useState(DEFAULT_SELECTED_KINDS);

  const tiles = useAtomValue(queryTilesAtom);
  const tilesKey = useAtomValue(queryTilesKeyAtom);
  const rows = useMemo(
    () => getCpuRows(tiles, selectedKinds, splitByTile),
    [tiles, selectedKinds, splitByTile],
  );
  const legend = useMemo<LegendItem<string>[]>(
    () =>
      getTileKinds(tiles).map((kind) => ({
        value: kind,
        label: kind,
        color: legendSwatchColor,
      })),
    [tiles],
  );
  const height = getCpuTrackHeight(rows.length);

  const { containerRef, rendererRef } = useWebGlRenderer({
    remount,
    create: ({ setUpContextListeners, getWasContextLost }) =>
      setUpRenderer(setUpContextListeners, getWasContextLost),
    onResize: (rendererObj) => {
      resizeRenderer(rendererObj);
      draw();
      render();
    },
  });

  const throttledRangeQuery = useThrottledCallback(
    (referenceNs: bigint, visibleRange: TsRange, worldRange: TsRange) => {
      const queryGranularity = getAggGranularity(
        visibleRange[1] - visibleRange[0],
      );
      query(referenceNs, visibleRange, worldRange, queryGranularity);
      setGranularity(queryGranularity);
    },
    100,
    { leading: true, trailing: true },
  );

  const render = useCallback(() => {
    if (!rendererRef.current) return;
    const { renderer, scene, camera } = rendererRef.current;
    renderer.render(scene, camera);
  }, [rendererRef]);

  const draw = useCallback(() => {
    const referenceNs = store.get(referenceNsAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (!rendererRef.current || !visibleRange || referenceNs == null) return;

    drawCpuData(
      rendererRef.current,
      referenceNs,
      visibleRange,
      store.get(aggCpuAtom),
    );
  }, [rendererRef]);

  const throttledDrawAndRender = useThrottledCallbackIfVisible(
    useCallback(() => {
      draw();
      render();
    }, [draw, render]),
    50,
    { leading: true, trailing: true },
  );

  const onRangeChange = useCallback(() => {
    if (!rendererRef.current) return;

    const referenceNs = store.get(referenceNsAtom);
    const worldRange = store.get(worldRangeAtom);
    const visibleRange = store.get(visibleRangeAtom);
    if (referenceNs == null || !visibleRange || !worldRange) return;

    moveCpuCamera(rendererRef.current, visibleRange);
    draw();
    throttledRangeQuery(referenceNs, visibleRange, worldRange);
    render();
  }, [rendererRef, draw, throttledRangeQuery, render]);

  // refetch if the tiles change
  useLayoutEffect(() => {
    if (!store.set(syncAggCpuTilesAtom, tilesKey)) return;
    resetQueries();
    onRangeChange();
  }, [tilesKey, resetQueries, onRangeChange]);

  useLayoutEffect(() => {
    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);
    const emitter = store.get(aggCpuEmitterAtom);
    emitter.addListener(drawEventType, throttledDrawAndRender);

    onRangeChange();

    return () => {
      emitter.removeListener(drawEventType, throttledDrawAndRender);
      throttledRangeQuery.cancel();
      throttledDrawAndRender.cancel();
      unsubscribeRange();
    };
  }, [onRangeChange, throttledDrawAndRender, throttledRangeQuery]);

  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.rows = rows;
    draw();
    render();
  }, [rendererRef, rows, draw, render]);

  return (
    <div className={trackStyles.trackContainer} style={{ height }}>
      <div ref={containerRef} className={trackStyles.trackCanvasContainer} />
      <CpuYAxis rows={rows} />
      <TrackControls
        name="CPU"
        bucketSize={granularity}
        legend={legend}
        legendMultiSelection={{
          values: selectedKinds,
          onChange: setSelectedKinds,
        }}
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

const CpuTrackBodyWithRemount = withWebGlRemount(CpuTrackBody);
export default function CpuTrack() {
  const { query, resetQueries } = useAggCpuQuery(AGG_CPU_CHART_ID);
  const hasTiles = useAtomValue(queryTilesAtom).length > 0;
  if (!hasTiles) return null;

  return <CpuTrackBodyWithRemount query={query} resetQueries={resetQueries} />;
}
