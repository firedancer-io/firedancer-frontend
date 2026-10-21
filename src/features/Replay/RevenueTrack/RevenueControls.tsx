import type { Dispatch, SetStateAction } from "react";
import {
  revenueScaleOptions,
  type RevenueViewOpts,
  revenueTypeLabels,
} from "./consts.ts";
import { feesColor } from "../../../colors.ts";
import type { RevenueType } from "../../../api/entities.ts";
import type { AggGranularity } from "../../../api/types.ts";
import TrackControls, {
  TrackControlsDivider,
  TrackControlsOptions,
  TrackControlsToggle,
} from "../TrackControls.tsx";

interface RevenueControlsProps {
  type: RevenueType;
  isAgg: boolean;
  granularity: AggGranularity | undefined;
  opts: RevenueViewOpts;
  setOpts: Dispatch<SetStateAction<RevenueViewOpts>>;
}

export default function RevenueControls({
  type,
  isAgg,
  granularity,
  opts,
  setOpts,
}: RevenueControlsProps) {
  return (
    <TrackControls
      name={revenueTypeLabels[type]}
      bucketSize={isAgg ? granularity : "txn"}
      legend={[{ label: revenueTypeLabels[type], color: feesColor }]}
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
