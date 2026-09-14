import { createContext, useContext } from "react";
import type { SlotTransactions } from "../../api/types";
import type { CuStats, Durations, FeeStats, TxnBundleStats } from "./const";

export type GetTxnBundleStats = (txnIdx: number) => TxnBundleStats | undefined;

export interface SlotTransactionsContextValue {
  transactions: SlotTransactions;
  getTxnBundleStats: GetTxnBundleStats;
  txnStateDurations: {
    vote: number;
    nonVote: number;
    bundle: number;
    voteMin: number;
    voteMax: number;
    nonVoteMin: number;
    nonVoteMax: number;
    bundleMin: number;
    bundleMax: number;
    max: number;
  };
  landedStateDurations: {
    unlanded: Durations;
    landedSuccess: Durations;
    landedFailed: Durations;
    max: number;
  };
  computeUnitStats: CuStats;
  feeBreakdownStats: FeeStats;
}

export const SlotTransactionsContext = createContext<
  SlotTransactionsContextValue | undefined
>(undefined);

export function useSlotTransactionsContext() {
  return useContext(SlotTransactionsContext);
}
