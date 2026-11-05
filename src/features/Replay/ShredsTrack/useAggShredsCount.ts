import { makeAggBucketHook } from "../useAggBucketSnapshot";
import { aggShredsAtom, aggShredsEmitterAtom } from "./atoms";

export const useAggShredsCount = makeAggBucketHook(
  aggShredsAtom,
  aggShredsEmitterAtom,
);
