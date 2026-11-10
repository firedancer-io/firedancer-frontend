import { atom, getDefaultStore, useAtom } from "jotai";
import { useCallback, useLayoutEffect } from "react";
import { useThrottledCallback } from "use-debounce";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import type { TileStatesGranularity } from "../../../api/types.ts";
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
import { toLegendItem, trackStates } from "../tileStates/consts.ts";
import type { TileStatesTrackConfig } from "../tileStates/utils.ts";
import {
  canShowErrorStates,
  createExecrpComposite,
  type ExecrpMode,
  type ExecrpViewOpts,
} from "./execrpComposite.ts";
import { useTileStatesRenderer } from "../tileStates/useTileStatesRenderer.ts";
import { tileStatesCaches } from "../tileStates/tileStatesCache.ts";
import { findTxnAtCursor } from "../tileStates/hoverUtils.ts";
import type { RendererObj } from "../tileStates/utils.ts";
import { useTileCacheSubscription } from "../tiles/useTileCache.ts";
import { hoveredExecrpTxnAtom, visibleRangeAtom } from "../atoms.ts";
import { useHoveredPosition, type HoveredRect } from "../useHoveredPosition.ts";
import { useContainerSlotHitTest } from "../slotHighlight.ts";
import { useTileStatesQuery } from "../tileStates/useTileStatesQuery.ts";
import type { AggTileStatesQuery } from "../tileStates/useAggTileStatesQuery.ts";
import RowLabels from "../RowLabels.tsx";
import TrackControls, {
  TrackControlsDivider,
  TrackControlsOptions,
  TrackControlsSlider,
  TrackControlsToggle,
} from "../TrackControls.tsx";
import { getRowsLayout, trackInsetPx, trackNames } from "../layout.ts";
import styles from "../track.module.css";

const store = getDefaultStore();

const modeOptions: { value: ExecrpMode; label: string }[] = [
  { value: "heatmap", label: "Heatmap" },
  { value: "stacked", label: "Stacked" },
];

const execrpViewOptsAtom = atom<ExecrpViewOpts>({
  mode: "heatmap",
  showErrorStates: false,
  idleWeight: 0.05,
});

function getTxnAtPoint(
  renderer: RendererObj,
  clientX: number,
  clientY: number,
  rect: HoveredRect,
) {
  const visibleRange = store.get(visibleRangeAtom);
  if (!visibleRange || !rect.width || !rect.height) return;

  return findTxnAtCursor(renderer, visibleRange, {
    fracX: (clientX - rect.left) / rect.width,
    fracY: (clientY - rect.top) / rect.height,
    widthPx: rect.width,
  });
}

function clearHoveredExecrpTxn() {
  store.set(hoveredExecrpTxnAtom, undefined);
}

const granularityLabels: Record<TileStatesGranularity, string> = {
  txn: "txn",
  txn_batch: "batch",
};

function getStates(granularity: TileStatesGranularity | undefined) {
  return trackStates.execrp[granularity ?? TileStatesGranularityEnum.txn];
}

const config: TileStatesTrackConfig = {
  kind: "execrp",
  getStates,
  createComposite: (ctx) =>
    createExecrpComposite(ctx, () => store.get(execrpViewOptsAtom)),
};

interface ExecrpTrackProps extends WebGlRemountProps {
  height: number;
  aggQuery: AggTileStatesQuery;
}

function ExecrpTrack({ height, aggQuery, remount }: ExecrpTrackProps) {
  const [opts, setOpts] = useAtom(execrpViewOptsAtom);
  const { query, aggGranularity } = useTileStatesQuery(aggQuery);
  const {
    containerRef,
    rendererRef,
    requestRender,
    rows,
    isAgg,
    nonAggGranularity,
  } = useTileStatesRenderer({ config, remount, query });
  const granularity = isAgg ? undefined : nonAggGranularity;
  const layout = getRowsLayout(height, rows.length, {
    insetPx: trackInsetPx.banks,
  });
  const labels = rows.map(({ label }) => label);

  useLayoutEffect(() => {
    requestRender();
  }, [opts, requestRender]);

  const throttledResolveHoverTxn = useThrottledCallback(
    (clientX: number, clientY: number, rect: HoveredRect) => {
      const renderer = rendererRef.current;
      store.set(
        hoveredExecrpTxnAtom,
        renderer && getTxnAtPoint(renderer, clientX, clientY, rect),
      );
    },
    30,
  );

  const onHoverLeave = useCallback(() => {
    throttledResolveHoverTxn.cancel();
    clearHoveredExecrpTxn();
  }, [throttledResolveHoverTxn]);

  const { setContainer: setHoverContainer, notifyChange: notifyHover } =
    useHoveredPosition({
      onHoverChange: throttledResolveHoverTxn,
      onHoverLeave,
    });

  useLayoutEffect(() => {
    setHoverContainer(containerRef.current);
    return () => {
      setHoverContainer(null);
      onHoverLeave();
    };
  }, [containerRef, setHoverContainer, onHoverLeave]);

  // new txn data can change the txn under a still cursor
  useTileCacheSubscription(tileStatesCaches.txn, notifyHover);

  useContainerSlotHitTest(containerRef, (clientX, clientY, rect) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    return getTxnAtPoint(renderer, clientX, clientY, rect)?.slot;
  });

  return (
    <>
      <div
        className={styles.rows}
        style={{
          top: layout.topPx,
          height: layout.rowPx * Math.max(rows.length, 1),
        }}
      >
        <div ref={containerRef} className={styles.trackCanvasContainer} />
      </div>
      <RowLabels labels={labels} layout={layout} />
      <TrackControls
        name={trackNames.banks}
        trackId="banks"
        bucketSize={
          isAgg ? aggGranularity : granularityLabels[nonAggGranularity]
        }
        legend={getStates(granularity).map(toLegendItem)}
      >
        <TrackControlsOptions
          label="Mode"
          options={modeOptions}
          value={opts.mode}
          onChange={(mode) => setOpts((o) => ({ ...o, mode }))}
        />
        <TrackControlsDivider />
        <TrackControlsSlider
          label="Idle weight"
          value={opts.idleWeight}
          min={0}
          max={1}
          step={0.05}
          onChange={(idleWeight) => setOpts((o) => ({ ...o, idleWeight }))}
        />
        {canShowErrorStates(granularity, opts.mode) && (
          <>
            <TrackControlsDivider />
            <TrackControlsToggle
              label="Error state"
              checked={opts.showErrorStates}
              onChange={(showErrorStates) =>
                setOpts((o) => ({ ...o, showErrorStates }))
              }
            />
          </>
        )}
      </TrackControls>
    </>
  );
}

const ExecrpTrackWithRemount = withWebGlRemount(ExecrpTrack);
export default ExecrpTrackWithRemount;
