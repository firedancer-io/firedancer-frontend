import type { Dispatch, SetStateAction } from "react";
import {
  execrpStates,
  replayStates,
  tileStateColors,
  tileStateLabels,
  type TileStatesViewOpts,
  type TileKind,
} from "./consts.ts";
import type { TileStatesGranularity } from "../../../api/types.ts";
import type { TileState } from "../../../api/entities.ts";
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
import TrackControls, {
  TrackControlsToggle,
  type LegendItem,
} from "../TrackControls.tsx";

function toLegendItem(state: TileState): LegendItem {
  return { label: tileStateLabels[state], color: tileStateColors[state] };
}

const replayLegend = replayStates.map(toLegendItem);

const execrpLegends: Record<TileStatesGranularity, LegendItem[]> = {
  txn: execrpStates.txn.map(toLegendItem),
  txn_batch: execrpStates.txn_batch.map(toLegendItem),
};

interface TileStatesControlsProps {
  kind: TileKind;
  granularity: TileStatesGranularity;
  isAgg: boolean;
  opts: TileStatesViewOpts;
  setOpts: Dispatch<SetStateAction<TileStatesViewOpts>>;
}

export default function TileStatesControls({
  kind,
  granularity,
  isAgg,
  opts,
  setOpts,
}: TileStatesControlsProps) {
  if (kind === "replay") {
    return (
      <TrackControls
        name="Replay"
        bucketSize={isAgg ? undefined : "slot"}
        legend={isAgg ? undefined : replayLegend}
      />
    );
  }

  return (
    <TrackControls
      name="Execrp"
      bucketSize={
        isAgg
          ? undefined
          : granularity === TileStatesGranularityEnum.txn
            ? "txn"
            : "batch"
      }
      legend={isAgg ? undefined : execrpLegends[granularity]}
    >
      {!isAgg && granularity === TileStatesGranularityEnum.txn && (
        <TrackControlsToggle
          label="Error state"
          checked={opts.showErrorStates}
          onChange={(showErrorStates) =>
            setOpts((o) => ({ ...o, showErrorStates }))
          }
        />
      )}
    </TrackControls>
  );
}
