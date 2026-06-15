import { atomWithStorage } from "jotai/utils";

/** Animate changing numbers with the digit-tumbling effect. */
export const animateNumbersAtom = atomWithStorage(
  "fd:animateNumbers",
  true,
  undefined,
  { getOnInit: true },
);
