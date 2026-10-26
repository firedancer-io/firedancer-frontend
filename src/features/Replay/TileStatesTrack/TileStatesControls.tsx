import type { Dispatch, SetStateAction } from "react";
import {
  execrpStates,
  replayStates,
  tileStateColors,
  tileStateLabels,
  type ActiveTileState,
  type TileStatesViewOpts,
  type TileKind,
  type TileStatesView,
} from "./consts.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import TrackControls, {
  TrackControlsToggle,
  type LegendItem,
} from "../TrackControls.tsx";

function toLegendItem(state: ActiveTileState): LegendItem {
  return { label: tileStateLabels[state], color: tileStateColors[state] };
}

const replayLegend = replayStates.map(toLegendItem);

const execrpLegends: Record<TileStatesGranularity, LegendItem[]> = {
  txn: execrpStates.txn.map(toLegendItem),
  txn_batch: execrpStates.txn_batch.map(toLegendItem),
};

interface TileStatesControlsProps {
  kind: TileKind;
  view: TileStatesView;
  opts: TileStatesViewOpts;
  setOpts: Dispatch<SetStateAction<TileStatesViewOpts>>;
}

export default function TileStatesControls({
  kind,
  view,
  opts,
  setOpts,
}: TileStatesControlsProps) {
  if (kind === "replay") {
    return (
      <TrackControls
        name="Replay"
        bucketSize={view === "agg" ? undefined : "slot"}
        legend={view === "agg" ? undefined : replayLegend}
      />
    );
  }

  return (
    <TrackControls
      name="Execrp"
      bucketSize={view === "agg" ? undefined : view === "txn" ? "txn" : "batch"}
      legend={view === "agg" ? undefined : execrpLegends[view]}
    >
      {view === "txn" && (
        <TrackControlsToggle
          label="Error state"
          checked={opts.showOutlines}
          onChange={(showOutlines) => setOpts((o) => ({ ...o, showOutlines }))}
        />
      )}
    </TrackControls>
  );
}
