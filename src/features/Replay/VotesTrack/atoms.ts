import { atom } from "jotai";
import { isAlpenglowAtom, voteStateAtom } from "../../../api/atoms";
import { myStakeAmountAtom } from "../../../atoms";

export const votesMissingStakeAtom = atom(false);

export const isVotesTrackAvailableAtom = atom((get) => {
  if (get(isAlpenglowAtom) !== true) return false;
  if (get(voteStateAtom) === "non-voting") return false;
  const stake = get(myStakeAmountAtom);
  if (stake !== undefined && stake === 0n) return false;
  return !get(votesMissingStakeAtom);
});
