import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import type { AggGranularity } from "../../../api/types.ts";
import type { TsRange } from "../../WebGl/webglUtils.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlRenderer } from "../../WebGl/useWebGlRenderer.ts";
import { useFrameRender } from "../../WebGl/useFrameRender.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  hoveredCpuRowsAtom,
  referenceNsAtom,
  visibleRangeAtom,
  worldRangeAtom,
} from "../atoms.ts";
import { useHoveredPosition } from "../useHoveredPosition.ts";
import TrackControls, {
  TrackControlsToggle,
  type LegendItem,
} from "../TrackControls.tsx";
import { tileBusyGreenColor, tileBusyRedColor } from "../../../colors.ts";
import {
  aggCpuAtom,
  aggCpuEmitterAtom,
  cpuRowsAtom,
  cpuSelectedKindsAtom,
  cpuSplitByTileAtom,
  drawEventType,
  queryTilesAtom,
  queryTilesKeyAtom,
  syncAggCpuTilesAtom,
} from "./atoms.ts";
import { AGG_CPU_CHART_ID } from "./const.ts";
import {
  getAggGranularity,
  useAggCpuQuery,
  type AggCpuQuery,
} from "./useAggCpuQuery.ts";
import {
  drawCpuData,
  getCpuRowsLayout,
  getTileKinds,
  moveCpuCamera,
  resizeRenderer,
  setUpRenderer,
} from "./utils.ts";
import RowLabels from "../RowLabels.tsx";
import { trackNames } from "../layout.ts";
import trackStyles from "../track.module.css";

const store = getDefaultStore();

const legendSwatchColor = `linear-gradient(to top, ${tileBusyGreenColor}, ${tileBusyRedColor})`;

interface CpuTrackProps {
  height: number;
}

interface CpuTrackBodyProps extends CpuTrackProps, WebGlRemountProps {
  query: AggCpuQuery;
  resetQueries: () => void;
}

function CpuTrackBody({
  remount,
  height,
  query,
  resetQueries,
}: CpuTrackBodyProps) {
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );
  const [splitByTile, setSplitByTile] = useAtom(cpuSplitByTileAtom);
  const [selectedKinds, setSelectedKinds] = useAtom(cpuSelectedKindsAtom);

  const tiles = useAtomValue(queryTilesAtom);
  const tilesKey = useAtomValue(queryTilesKeyAtom);
  const rows = useAtomValue(cpuRowsAtom);
  const legend = useMemo<LegendItem<string>[]>(
    () =>
      getTileKinds(tiles).map((kind) => ({
        value: kind,
        label: kind,
        color: legendSwatchColor,
      })),
    [tiles],
  );
  const rowsLayout = useMemo(
    () => getCpuRowsLayout(height, rows.length),
    [height, rows.length],
  );

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

  const throttledResolveHover = useThrottledCallback(() => {
    const visibleRange = store.get(visibleRangeAtom);
    if (!visibleRange) {
      store.set(hoveredCpuRowsAtom, undefined);
      return;
    }

    store.set(hoveredCpuRowsAtom, rows);
  }, 30);

  const onHoverLeave = useCallback(() => {
    throttledResolveHover.cancel();
    store.set(hoveredCpuRowsAtom, undefined);
  }, [throttledResolveHover]);

  const { setContainer: setHoverContainer, notifyChange: notifyHover } =
    useHoveredPosition({
      onHoverChange: throttledResolveHover,
      onHoverLeave,
    });

  useLayoutEffect(() => {
    notifyHover();
  }, [rows, notifyHover]);

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

  const requestRender = useFrameRender(render);

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
      requestRender();
    }, [draw, requestRender]),
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
    requestRender();
  }, [rendererRef, draw, throttledRangeQuery, requestRender]);

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

    setHoverContainer(containerRef.current);

    onRangeChange();

    return () => {
      emitter.removeListener(drawEventType, throttledDrawAndRender);
      throttledRangeQuery.cancel();
      throttledDrawAndRender.cancel();
      unsubscribeRange();
      setHoverContainer(null);
      onHoverLeave();
    };
  }, [
    onRangeChange,
    throttledDrawAndRender,
    throttledRangeQuery,
    setHoverContainer,
    onHoverLeave,
    containerRef,
  ]);

  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.rows = rows;
    resizeRenderer(rendererRef.current);
    draw();
    requestRender();
  }, [rendererRef, rows, draw, requestRender]);

  return (
    <>
      <div ref={containerRef} className={trackStyles.trackCanvasContainer} />
      <RowLabels labels={rows.map(({ label }) => label)} layout={rowsLayout} />
      <TrackControls
        name={trackNames.cpu}
        bucketSize={granularity}
        trackId="cpu"
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
    </>
  );
}

const CpuTrackBodyWithRemount = withWebGlRemount(CpuTrackBody);
export default function CpuTrack(props: CpuTrackProps) {
  const { query, resetQueries } = useAggCpuQuery(AGG_CPU_CHART_ID);
  return (
    <CpuTrackBodyWithRemount
      query={query}
      resetQueries={resetQueries}
      {...props}
    />
  );
}
