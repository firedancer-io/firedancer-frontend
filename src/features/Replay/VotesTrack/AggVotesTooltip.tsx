import { useAtomValue } from "jotai";
import RowSeparator from "../../../components/RowSeparator";
import ReplayCursorTooltip, {
  AggTooltipHeader,
  CursorTimestampRow,
  TooltipRow,
} from "../Tooltip";
import { hoveredAggVotesAtom, type HoveredAggVotes } from "../atoms";
import { formatSignedMs } from "../Tooltip/utils";
import { nsBucketSizes } from "../const";
import { useAggBucket } from "../useAggBucket";
import {
  aggVotesAtom,
  aggVotesDrawTilesAtom,
  aggVotesEmitterAtom,
} from "./aggAtoms";
import { latencyLineLabels, latencyLines } from "./consts";
import { resampleAggVotes } from "./series";

export default function AggVotesTooltip() {
  const hovered = useAtomValue(hoveredAggVotesAtom);
  if (hovered == null) return null;

  return (
    <ReplayCursorTooltip>
      <AggVotesTooltipContent hovered={hovered} />
    </ReplayCursorTooltip>
  );
}

interface AggVotesTooltipContentProps {
  hovered: HoveredAggVotes;
}

function AggVotesTooltipContent({ hovered }: AggVotesTooltipContentProps) {
  const { bucketIdx, granularity } = hovered;
  const bucket = useAggBucket(
    aggVotesAtom,
    aggVotesEmitterAtom,
    aggVotesDrawTilesAtom,
    resampleAggVotes,
    granularity,
    bucketIdx,
  );

  const bucketSizeNs = nsBucketSizes[granularity];
  const startNs = BigInt(bucketIdx) * bucketSizeNs;

  return (
    <>
      <AggTooltipHeader
        startNs={startNs}
        endNs={startNs + bucketSizeNs}
        granularity={granularity}
      />

      <RowSeparator />
      {latencyLines.map((line) => {
        const latencyMs = bucket?.[line];
        return (
          <TooltipRow
            key={line}
            label={latencyLineLabels[line]}
            value={latencyMs == null ? undefined : formatSignedMs(latencyMs)}
            unit="ms"
          />
        );
      })}

      <RowSeparator />
      <CursorTimestampRow />
    </>
  );
}
