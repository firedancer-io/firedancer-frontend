import { logDebug, logError } from "../../logger";
import { deriveLeaderSchedule, schedFnv1a64 } from "./leaderSchedule";
import type { WsEntity } from "./types";
import type { WsMessage } from "./wsMessage";

/* epoch.new without leader_slots: derive the schedule from
   staked_lamports so downstream sees an identical message either way.
   Everything else (including epoch.new with leader_slots, sent by
   Frankendancer and older backends) passes through unchanged. */
export function fillEpochLeaderSlots(msg: WsMessage): WsEntity {
  if (msg.topic !== "epoch") return msg;

  const value = msg.value;
  if (value.leader_slots) return msg as WsEntity;

  const startMs = performance.now();
  const sched = deriveLeaderSchedule(
    BigInt(value.epoch),
    value.staked_lamports,
    value.end_slot - value.start_slot + 1,
  );
  logDebug(
    "WS",
    `derived leader schedule for epoch ${value.epoch} (${sched.length} rotations) in ${(performance.now() - startMs).toFixed(1)}ms`,
  );

  if (value.leader_slots_hash !== undefined) {
    const hash = schedFnv1a64(sched);
    if (hash !== value.leader_slots_hash) {
      logError(
        "WS",
        `derived leader schedule hash mismatch for epoch ${value.epoch}: derived ${hash}, backend sent ${value.leader_slots_hash}`,
      );
    }
  }

  return { ...msg, value: { ...value, leader_slots: sched } };
}
