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
import { TileStatesGranularityEnum } from "../../../api/entities.ts";
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

interface TileStatesControlsProps {
  kind: TileKind;
  granularity: TileStatesGranularity;
  isAgg: boolean;
  availableModes: TileStatesMode[];
  mode: TileStatesMode;
  /** Whether the displayed mode weighs idle time */
  showIdleWeight: boolean;
  showSplitLanes: boolean;
  aggGranularity: AggGranularity | undefined;
  opts: TileStatesViewOpts;
  setOpts: Dispatch<SetStateAction<TileStatesViewOpts>>;
}

export default function TileStatesControls({
  kind,
  granularity,
  isAgg,
  availableModes,
  mode,
  showIdleWeight,
  showSplitLanes,
  aggGranularity,
  opts,
  setOpts,
}: TileStatesControlsProps) {
  const isExecrpTxn =
    kind === "execrp" &&
    !isAgg &&
    granularity === TileStatesGranularityEnum.txn;
  const showErrorStates = isExecrpTxn;
  const legend =
    trackStates[kind][isAgg ? TileStatesGranularityEnum.txn : granularity].map(
      toLegendItem,
    );
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
        name="Replay"
        bucketSize={isAgg ? aggGranularity : "slot"}
        legend={legend}
      >
        {controls}
      </TrackControls>
    );
  }

  return (
    <TrackControls
      name="Execrp"
      bucketSize={
        isAgg
          ? aggGranularity
          : granularity === TileStatesGranularityEnum.txn
            ? "txn"
            : "batch"
      }
      legend={legend}
    >
      {controls}
    </TrackControls>
  );
}
