import { atom } from "jotai";
import { isAlpenglowAtom, voteStateAtom } from "../../../api/atoms";
import { myStakeAmountAtom } from "../../../atoms";

export const isVotesTrackAvailableAtom = atom((get) => {
  if (get(isAlpenglowAtom) !== true) return false;
  if (get(voteStateAtom) === "non-voting") return false;
  return get(myStakeAmountAtom) !== 0n;
});
