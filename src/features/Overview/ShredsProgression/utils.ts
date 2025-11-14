import { getSlotGroupLeader } from "../../../utils";

export function getSlotGroupLabelId(slot: number) {
  return `slot-group-label-${getSlotGroupLeader(slot)}`;
}

export function getSlotLabelId(slot: number) {
  return `slot-label-${slot}`;
}
