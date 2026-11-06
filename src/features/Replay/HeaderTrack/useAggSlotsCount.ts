import { makeAggBucketHook } from "../useAggBucketSnapshot";
import { aggHeaderEmitterAtom, aggSlotsAtom } from "./aggAtoms";

export const useAggSlotsCount = makeAggBucketHook(
  aggSlotsAtom,
  aggHeaderEmitterAtom,
);
