import { atom } from "jotai";
import { isAlpenglowAtom, voteStateAtom } from "../../../api/atoms";
import { myStakeAmountAtom } from "../../../atoms";
import type { SlotVotes } from "./votesData";

export const isVotesTrackAvailableAtom = atom((get) => {
  if (get(isAlpenglowAtom) !== true) return false;
  if (get(voteStateAtom) === "non-voting") return false;
  return get(myStakeAmountAtom) !== 0n;
});

export const slotVotesAtom = atom<ReadonlyMap<number, SlotVotes>>(new Map());
