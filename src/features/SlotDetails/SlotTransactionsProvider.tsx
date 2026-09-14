import { useMemo, type PropsWithChildren } from "react";
import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import { useSlotQueryResponseTransactions } from "../../hooks/useSlotQuery";
import { getTxnStateDurations } from "../../transactionUtils";
import {
  SlotTransactionsContext,
  type GetTxnBundleStats,
  type SlotTransactionsContextValue,
} from "./SlotTransactionsContext";
import { sum, values } from "lodash";
import { defaultIncomeMaxValue, type Durations, type FeeStats } from "./const";
import { getPaidTxnFees, getPaidTxnTips } from "../../utils";

const initCounts = { count: 0, total: 0, min: Infinity, max: -Infinity };

const initDurations: Durations = {
  preLoading: 0,
  validating: 0,
  loading: 0,
  execute: 0,
  postExecute: 0,
  total: 0,
};

/**
 * Provide transaction aggregate data. Assumes all txn_* data arrays have the same length.
 */
export default function SlotTransactionsProvider({
  children,
}: PropsWithChildren) {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const transactions =
    useSlotQueryResponseTransactions(selectedSlot).response?.transactions;

  const value = useMemo<SlotTransactionsContextValue | undefined>(() => {
    if (!transactions) return;

    const bundleTxnIdxsByMicroblockId = new Map<number, number[]>();

    for (let i = 0; i < transactions.txn_microblock_id.length; i++) {
      // collect all txnIdxs
      const mbId = transactions.txn_microblock_id[i];
      const txnIdxs = bundleTxnIdxsByMicroblockId.get(mbId) ?? [];
      txnIdxs.push(i);
      bundleTxnIdxsByMicroblockId.set(mbId, txnIdxs);
    }

    /**
     * Get txnIdxs from the same bundle, or undefined if txn is not in a bundle
     */
    const getTxnBundleStats: GetTxnBundleStats = (txnIdx) => {
      if (!transactions.txn_from_bundle[txnIdx]) return;

      const mbId = transactions.txn_microblock_id[txnIdx];
      const bundleTxnIdxs = bundleTxnIdxsByMicroblockId.get(mbId) ?? [];

      return {
        totalCount: bundleTxnIdxs.length,
        order: bundleTxnIdxs.indexOf(txnIdx) + 1,
        bundleTxnIdxs,
      };
    };

    const vote = { ...initCounts };
    const nonVote = { ...initCounts };
    const bundle = { ...initCounts };

    const unlanded = { ...initDurations };
    const landedSuccess = { ...initDurations };
    const landedFailed = { ...initDurations };

    const computeUnitStats = { vote: 0, bundle: 0, other: 0 };
    const feeBreakdownStats: FeeStats = {
      tips: 0,
      fees: 0,
      maxValue: 0,
    };

    for (
      let i = 0;
      i < transactions.txn_mb_start_timestamps_nanos.length;
      i++
    ) {
      const bundleStats = getTxnBundleStats(i);
      const duration = getTxnStateDurations(
        transactions,
        i,
        bundleStats?.bundleTxnIdxs,
      );

      // vote / bundle state durations
      const totalDuration = sum(values(duration).map((n) => Number(n)));

      if (transactions.txn_is_simple_vote?.[i]) {
        vote.total += totalDuration;
        vote.count++;
        vote.min = Math.min(vote.min, totalDuration);
        vote.max = Math.max(vote.max, totalDuration);
      } else {
        nonVote.total += totalDuration;
        nonVote.count++;
        nonVote.min = Math.min(nonVote.min, totalDuration);
        nonVote.max = Math.max(nonVote.max, totalDuration);
      }

      if (transactions.txn_from_bundle[i]) {
        bundle.total += totalDuration;
        bundle.count++;
        bundle.min = Math.min(bundle.min, totalDuration);
        bundle.max = Math.max(bundle.max, totalDuration);
      }

      // landing state durations
      const sumDurations = (
        durations: typeof initDurations,
        b: typeof duration,
        bTotal: number,
      ) => {
        durations.preLoading += Number(b.preLoading);
        durations.validating += Number(b.validating);
        durations.loading += Number(b.loading);
        durations.execute += Number(b.execute);
        durations.postExecute += Number(b.postExecute);
        durations.total += bTotal;
      };

      if (!transactions.txn_landed[i]) {
        sumDurations(unlanded, duration, totalDuration);
      } else if (transactions.txn_error_code[i] === 0) {
        sumDurations(landedSuccess, duration, totalDuration);
      } else {
        sumDurations(landedFailed, duration, totalDuration);
      }

      // compute unit stats
      const consumedCus = transactions.txn_compute_units_consumed[i];
      const isVote = !!transactions.txn_is_simple_vote?.[i];
      const isBundle = transactions.txn_from_bundle[i];
      if (isVote) {
        computeUnitStats.vote += consumedCus;
      } else if (isBundle) {
        computeUnitStats.bundle += consumedCus;
      } else {
        computeUnitStats.other += consumedCus;
      }

      // fee breakdown stats
      feeBreakdownStats.fees += Number(getPaidTxnFees(transactions, i));
      feeBreakdownStats.tips += Number(getPaidTxnTips(transactions, i));
    }

    const txnStateDurations = {
      vote: vote.total / vote.count,
      nonVote: nonVote.total / nonVote.count,
      bundle: bundle.total / bundle.count,
      voteMin: vote.min,
      voteMax: vote.max,
      nonVoteMin: nonVote.min,
      nonVoteMax: nonVote.max,
      bundleMin: bundle.min,
      bundleMax: bundle.max,
      max: Math.max(vote.max, nonVote.max, bundle.max),
    };

    const landedStateDurations = {
      unlanded,
      landedSuccess,
      landedFailed,
      max: Math.max(unlanded.total, landedSuccess.total, landedFailed.total),
    };

    const income = feeBreakdownStats.tips + feeBreakdownStats.fees;
    const jito = feeBreakdownStats.tips * 0.06;
    feeBreakdownStats.maxValue =
      income > defaultIncomeMaxValue ? income + jito : defaultIncomeMaxValue;

    return {
      transactions,
      getTxnBundleStats,
      txnStateDurations,
      landedStateDurations,
      computeUnitStats,
      feeBreakdownStats,
    };
  }, [transactions]);

  return (
    <SlotTransactionsContext.Provider value={value}>
      {children}
    </SlotTransactionsContext.Provider>
  );
}
