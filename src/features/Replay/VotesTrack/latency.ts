import { getSlotGroupLeader } from "../../../utils";
import { CertKind } from "./consts";
import type { SlotVotes } from "./votesData";

export interface LatencyPoint {
  slot: number;
  ts: number;
  latencyMs: number;
}

export interface SlotLatencies {
  notarized: LatencyPoint[];
  fast: LatencyPoint[];
  slow: LatencyPoint[];
  skipped: LatencyPoint[];
}

// matches query_agg_votes: from the window's ParentReady plus the slot offset
export function getSlotLatencies(
  slotVotes: ReadonlyMap<number, SlotVotes>,
  targetSlotMs: number,
): SlotLatencies {
  const latencies: SlotLatencies = {
    notarized: [],
    fast: [],
    slow: [],
    skipped: [],
  };

  for (const [slot, { certs }] of slotVotes) {
    const windowStart = getSlotGroupLeader(slot);
    const parentReadyTs = slotVotes.get(windowStart)?.parentReadyTs;
    if (parentReadyTs === undefined) continue;

    const slotStartTs = parentReadyTs + (slot - windowStart) * targetSlotMs;
    const add = (line: keyof SlotLatencies, ts: number | undefined) => {
      if (ts === undefined) return;
      latencies[line].push({ slot, ts, latencyMs: ts - slotStartTs });
    };

    const notarTs = certs.get(CertKind.Notar);
    const fastTs = certs.get(CertKind.FastFinalize);
    const notarizedTs =
      notarTs === undefined || fastTs === undefined
        ? (notarTs ?? fastTs)
        : Math.min(notarTs, fastTs);
    const finalizeTs = certs.get(CertKind.Finalize);

    add("notarized", notarizedTs);
    add("fast", fastTs);
    add(
      "slow",
      finalizeTs === undefined || notarizedTs === undefined
        ? finalizeTs
        : Math.max(finalizeTs, notarizedTs),
    );
    add("skipped", certs.get(CertKind.Skip));
  }

  const { notarized, fast, slow, skipped } = latencies;
  for (const points of [notarized, fast, slow, skipped]) {
    points.sort((a, b) => a.ts - b.ts);
  }
  return latencies;
}
