import type { Dispatch, SetStateAction } from "react";
import {
  trackStates,
  tileStateColors,
  tileStateLabels,
  tileStatesModeLabels,
  type TileStatesMode,
  type TileStatesViewOpts,
  type TileKind,
} from "./consts.ts";
import type {
  AggGranularity,
  TileStatesGranularity,
} from "../../../api/types.ts";
import type { TileState } from "../../../api/entities.ts";
import { trackNames } from "../layout.ts";
import TrackControls, {
  TrackControlsDivider,
  TrackControlsOptions,
  TrackControlsSlider,
  TrackControlsToggle,
  type LegendItem,
} from "../TrackControls.tsx";

function toLegendItem(state: TileState): LegendItem {
  return { label: tileStateLabels[state], color: tileStateColors[state] };
}

const granularityLabels: Record<TileStatesGranularity, string> = {
  txn: "txn",
  txn_batch: "batch",
};

interface TileStatesControlsProps {
  kind: TileKind;
  nonAggGranularity: TileStatesGranularity;
  isAgg: boolean;
  availableModes: TileStatesMode[];
  mode: TileStatesMode;
  showIdleWeight: boolean;
  showSplitLanes: boolean;
  showErrorStates: boolean;
  aggGranularity: AggGranularity | undefined;
  opts: TileStatesViewOpts;
  setOpts: Dispatch<SetStateAction<TileStatesViewOpts>>;
}

export default function TileStatesControls({
  kind,
  nonAggGranularity,
  isAgg,
  availableModes,
  mode,
  showIdleWeight,
  showSplitLanes,
  showErrorStates,
  aggGranularity,
  opts,
  setOpts,
}: TileStatesControlsProps) {
  const legend =
    trackStates[kind][isAgg ? "agg" : nonAggGranularity].map(toLegendItem);
  const modeOptions = availableModes.map((value) => ({
    value,
    label: tileStatesModeLabels[value],
  }));

  const controls = (
    <>
      <TrackControlsOptions
        label="Mode"
        options={modeOptions}
        value={mode}
        onChange={(mode) => setOpts((o) => ({ ...o, mode }))}
      />
      {showSplitLanes && (
        <>
          <TrackControlsDivider />
          <TrackControlsToggle
            label="Split by lane"
            checked={opts.separateLanes}
            onChange={(separateLanes) =>
              setOpts((o) => ({ ...o, separateLanes }))
            }
          />
        </>
      )}
      {showIdleWeight && (
        <>
          <TrackControlsDivider />
          <TrackControlsSlider
            label="Idle weight"
            value={opts.idleWeight}
            min={0}
            max={1}
            step={0.05}
            onChange={(idleWeight) => setOpts((o) => ({ ...o, idleWeight }))}
          />
        </>
      )}
      {showErrorStates && (
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
    </>
  );

  if (kind === "replay") {
    return (
      <TrackControls
        name={trackNames.replay}
        trackId="replay"
        bucketSize={isAgg ? aggGranularity : "slot"}
        legend={legend}
      >
        {controls}
      </TrackControls>
    );
  }

  return (
    <TrackControls
      name={trackNames.banks}
      trackId="banks"
      bucketSize={isAgg ? aggGranularity : granularityLabels[nonAggGranularity]}
      legend={legend}
    >
      {controls}
    </TrackControls>
  );
}
