import { getDefaultStore, useAtomValue } from "jotai";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
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
import {
  aggCpuAtom,
  aggCpuEmitterAtom,
  drawEventType,
  queryTilesAtom,
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
  type RendererObj,
} from "./utils.ts";
import CpuYAxis from "./CpuYAxis.tsx";
import trackStyles from "../track.module.css";

const store = getDefaultStore();

const legendSwatchColor = `linear-gradient(to top, ${tileBusyGreenColor}, ${tileBusyRedColor})`;

interface CpuTrackProps {
  width: number;
}

interface CpuTrackBodyProps extends CpuTrackProps, WebGlRemountProps {
  query: AggCpuQuery;
}

function CpuTrackBody({ remount, width, query }: CpuTrackBodyProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [granularity, setGranularity] = useState<AggGranularity | undefined>(
    undefined,
  );
  const [splitByTile, setSplitByTile] = useState(false);
  const [selectedKinds, setSelectedKinds] = useState(DEFAULT_SELECTED_KINDS);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const tiles = useAtomValue(queryTilesAtom);
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

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
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
  }, []);

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
  }, []);

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
  }, [render, draw, throttledRangeQuery]);

  useLayoutEffect(() => {
    if (rendererRef.current || !containerRef.current) return;

    const rendererObj = setUpRenderer(setUpContextListeners, getWasContextLost);
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribeRange = store.sub(visibleRangeAtom, onRangeChange);
    const cleanUpRenderer = rendererObj.cleanUp;
    const emitter = store.get(aggCpuEmitterAtom);
    emitter.addListener(drawEventType, throttledDrawAndRender);

    setIsInitialized(true);
    onRangeChange();

    return () => {
      emitter.removeListener(drawEventType, throttledDrawAndRender);
      throttledRangeQuery.cancel();
      throttledDrawAndRender.cancel();
      unsubscribeRange();
      cleanUpRenderer();
      rendererRef.current = undefined;
    };
  }, [
    onRangeChange,
    setUpContextListeners,
    getWasContextLost,
    throttledDrawAndRender,
    throttledRangeQuery,
  ]);

  useLayoutEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    resizeRenderer(rendererRef.current, width, height);
    rendererRef.current.rows = rows;
    draw();
    render();
  }, [render, draw, width, height, rows, isInitialized]);

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
export default function CpuTrack(props: CpuTrackProps) {
  const { query } = useAggCpuQuery(AGG_CPU_CHART_ID);
  const hasTiles = useAtomValue(queryTilesAtom).length > 0;
  if (!hasTiles) return null;

  return <CpuTrackBodyWithRemount query={query} {...props} />;
}
