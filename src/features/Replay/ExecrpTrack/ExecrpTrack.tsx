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
import {
  findBatchSlotAtCursor,
  findExecrpHoverAtCursor,
  type TrackPoint,
} from "../tileStates/hoverUtils.ts";
import type { RendererObj } from "../tileStates/utils.ts";
import { useTileCacheSubscription } from "../tiles/useTileCache.ts";
import {
  hoveredExecrpBatchSlotAtom,
  hoveredExecrpLthashAtom,
  hoveredExecrpTxnAtom,
  visibleRangeAtom,
  type HoveredExecrpLthash,
  type HoveredExecrpTxn,
} from "../atoms.ts";
import { useHoveredPosition, type HoveredRect } from "../useHoveredPosition.ts";
import { isInRanges } from "../hoverUtils.ts";
import { clientXToMs } from "../utils.ts";
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

interface HoveredExecrp {
  txn: HoveredExecrpTxn | undefined;
  lthash: HoveredExecrpLthash | undefined;
  batchSlot: number | undefined;
}

function getHoveredAtPoint(
  renderer: RendererObj,
  clientX: number,
  clientY: number,
  rect: HoveredRect,
): HoveredExecrp | undefined {
  const visibleRange = store.get(visibleRangeAtom);
  if (!visibleRange || !rect.width || !rect.height) return;
  const ms = clientXToMs(clientX, rect, visibleRange);
  if (!isInRanges(renderer.modeRanges.nonAgg, ms)) return;

  const point: TrackPoint = {
    fracX: (clientX - rect.left) / rect.width,
    fracY: (clientY - rect.top) / rect.height,
    widthPx: rect.width,
  };
  const hovered = findExecrpHoverAtCursor(renderer, visibleRange, point);
  return {
    txn: hovered?.txn,
    lthash: hovered?.lthash,
    batchSlot: findBatchSlotAtCursor(renderer, visibleRange, point),
  };
}

function setHoveredExecrp(hovered: HoveredExecrp | undefined) {
  store.set(hoveredExecrpTxnAtom, hovered?.txn);
  store.set(hoveredExecrpLthashAtom, hovered?.lthash);
  store.set(hoveredExecrpBatchSlotAtom, hovered?.batchSlot);
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
  const { query, aggGranularity, granularityLevels } =
    useTileStatesQuery(aggQuery);
  const {
    containerRef,
    rendererRef,
    requestRender,
    rows,
    isAgg,
    nonAggGranularity,
  } = useTileStatesRenderer({ config, remount, query, granularityLevels });
  const granularity = isAgg ? undefined : nonAggGranularity;
  const layout = getRowsLayout(height, rows.length, {
    insetPx: trackInsetPx.banks,
  });
  const labels = rows.map(({ label }) => label);

  useLayoutEffect(() => {
    requestRender();
  }, [opts, requestRender]);

  const throttledResolveHover = useThrottledCallback(
    (clientX: number, clientY: number, rect: HoveredRect) => {
      const renderer = rendererRef.current;
      setHoveredExecrp(
        renderer && getHoveredAtPoint(renderer, clientX, clientY, rect),
      );
    },
    30,
  );

  const onHoverLeave = useCallback(() => {
    throttledResolveHover.cancel();
    setHoveredExecrp(undefined);
  }, [throttledResolveHover]);

  const { setContainer: setHoverContainer, notifyChange: notifyHover } =
    useHoveredPosition({
      onHoverChange: throttledResolveHover,
      onHoverLeave,
    });

  useLayoutEffect(() => {
    setHoverContainer(containerRef.current);
    return () => {
      setHoverContainer(null);
      onHoverLeave();
    };
  }, [containerRef, setHoverContainer, onHoverLeave]);

  // new data can change the txn or batch under a still cursor
  useTileCacheSubscription(tileStatesCaches.txn, notifyHover);
  useTileCacheSubscription(tileStatesCaches.txn_batch, notifyHover);

  useContainerSlotHitTest(containerRef, (clientX, clientY, rect) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const hovered = getHoveredAtPoint(renderer, clientX, clientY, rect);
    return hovered?.txn?.slot ?? hovered?.lthash?.slot ?? hovered?.batchSlot;
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
