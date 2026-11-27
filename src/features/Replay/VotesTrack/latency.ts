import { getSlotGroupLeader } from "../../../utils";
import { CertKind, latencyLines, type LatencyLine } from "./consts";
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
}

export function getSlotStartTs(
  slotVotes: ReadonlyMap<number, SlotVotes>,
  slot: number,
  targetSlotMs: number,
) {
  const windowStartSlot = getSlotGroupLeader(slot);
  const parentReadyTs = slotVotes.get(windowStartSlot)?.parentReadyTs;
  if (parentReadyTs === undefined) return;
  return parentReadyTs + (slot - windowStartSlot) * targetSlotMs;
}

function getLatencyCertTs(
  certs: ReadonlyMap<CertKind, number>,
): Record<LatencyLine, number | undefined> {
  const notarTs = certs.get(CertKind.Notar);
  const fastTs = certs.get(CertKind.FastFinalize);
  const notarizedTs =
    notarTs === undefined || fastTs === undefined
      ? (notarTs ?? fastTs)
      : Math.min(notarTs, fastTs);
  const finalizeTs = certs.get(CertKind.Finalize);
  return {
    notarized: notarizedTs,
    fast: fastTs,
    slow:
      finalizeTs === undefined || notarizedTs === undefined
        ? finalizeTs
        : Math.max(finalizeTs, notarizedTs),
  };
}

export function getSlotLatencies(
  slotVotes: ReadonlyMap<number, SlotVotes>,
  targetSlotMs: number,
): SlotLatencies {
  const latencies: SlotLatencies = {
    notarized: [],
    fast: [],
    slow: [],
  };

  for (const [slot, { certs }] of slotVotes) {
    const slotStartTs = getSlotStartTs(slotVotes, slot, targetSlotMs);
    if (slotStartTs === undefined) continue;

    const certTs = getLatencyCertTs(certs);
    for (const line of latencyLines) {
      const ts = certTs[line];
      if (ts === undefined) continue;
      latencies[line].push({ slot, ts, latencyMs: ts - slotStartTs });
    }
  }

  const { notarized, fast, slow } = latencies;
  for (const points of [notarized, fast, slow]) {
    points.sort((a, b) => a.ts - b.ts);
  }
  return latencies;
}
