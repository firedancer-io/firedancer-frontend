import { atom, getDefaultStore, useAtom } from "jotai";
import { useLayoutEffect } from "react";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import type { TileStatesGranularity } from "../../../api/types.ts";
import { TileState, TileStatesGranularityEnum } from "../../../api/entities.ts";
import { toLegendItem } from "../tileStates/consts.ts";
import type { TileStatesTrackConfig } from "../tileStates/utils.ts";
import {
  canShowErrorStates,
  createExecrpComposite,
  type ExecrpMode,
  type ExecrpViewOpts,
} from "./execrpComposite.ts";
import { useTileStatesRenderer } from "../tileStates/useTileStatesRenderer.ts";
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

const txnStates: TileState[] = [
  TileState.Loading,
  TileState.Validate,
  TileState.Execute,
  TileState.PostExecute,
  TileState.Sigverify,
  TileState.Lthash,
];

const batchStates: TileState[] = [
  TileState.LoadBatch,
  TileState.ValidBatch,
  TileState.ExecBatch,
  TileState.PostExecBatch,
  TileState.SigverifyBatch,
  TileState.LthashBatch,
];

const granularityLabels: Record<TileStatesGranularity, string> = {
  txn: "txn",
  txn_batch: "batch",
};

function getStates(granularity: TileStatesGranularity | undefined) {
  return granularity === TileStatesGranularityEnum.txn_batch
    ? batchStates
    : txnStates;
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
  const { containerRef, requestRender, rows, isAgg, nonAggGranularity } =
    useTileStatesRenderer({ config, remount, query });
  const granularity = isAgg ? undefined : nonAggGranularity;
  const layout = getRowsLayout(height, rows.length, {
    insetPx: trackInsetPx.banks,
  });
  const labels = rows.map(({ label }) => label);

  useLayoutEffect(() => {
    requestRender();
  }, [opts, requestRender]);

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
