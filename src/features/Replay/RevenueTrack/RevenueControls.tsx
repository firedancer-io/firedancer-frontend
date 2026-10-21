import type { Dispatch, SetStateAction } from "react";
import {
  revenueScaleOptions,
  type RevenueViewOpts,
  revenueSeries,
  revenueSeriesLabels,
} from "./consts.ts";
import type { AggGranularity } from "../../../api/types.ts";
import TrackControls, {
  TrackControlsDivider,
  TrackControlsOptions,
  TrackControlsToggle,
} from "../TrackControls.tsx";

interface RevenueControlsProps {
  isAgg: boolean;
  granularity: AggGranularity | undefined;
  opts: RevenueViewOpts;
  setOpts: Dispatch<SetStateAction<RevenueViewOpts>>;
}

export default function RevenueControls({
  isAgg,
  granularity,
  opts,
  setOpts,
}: RevenueControlsProps) {
  return (
    <TrackControls
      name={revenueSeriesLabels[opts.type]}
      bucketSize={isAgg ? granularity : "txn"}
      legend={revenueSeries}
      legendSelection={{
        value: opts.type,
        onChange: (type) => setOpts((o) => ({ ...o, type })),
      }}
    >
      <TrackControlsOptions
        label="Scale"
        options={revenueScaleOptions}
        value={opts.scale}
        onChange={(scale) => setOpts((o) => ({ ...o, scale }))}
      />

      {!isAgg && (
        <>
          <TrackControlsDivider />
          <TrackControlsToggle
            label="Split by tile"
            checked={opts.splitByRow}
            onChange={(splitByRow) => setOpts((o) => ({ ...o, splitByRow }))}
          />
        </>
      )}
    </TrackControls>
  );
}
