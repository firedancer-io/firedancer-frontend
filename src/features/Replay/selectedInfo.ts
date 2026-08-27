import { atom } from "jotai";
import type { RevenueType } from "../../api/entities";
import type {
  TxnTimestampBucket,
  TxnTimestampColumns,
} from "./ExecrpTrack/txnTimestamps";
import type { TxnMetaBucket, TxnMetaColumns } from "./RevenueTrack/txnMeta";

/**
 * Whatever the user last clicked in the replay chart, surfaced in the shared
 * info banner next to the card header. A discriminated union so any track can
 * contribute its own kind of selection.
 */
export type SelectedInfo =
  | { kind: "txn"; slot: number; txnIdx: number }
  | {
      kind: "aggBucket";
      type: RevenueType;
      /** Bucket value for `type`, in lamports. */
      value: bigint;
      /** Bucket time span, as absolute UNIX ns. */
      startNs: bigint;
      endNs: bigint;
    };

export const selectedInfoAtom = atom<SelectedInfo | undefined>(undefined);

/** Locate a selected txn's row within the timestamps bucket cache. */
export function findTxnTimestamps(
  buckets: TxnTimestampBucket[],
  slot: number,
  txnIdx: number,
): { txns: TxnTimestampColumns; i: number } | undefined {
  for (const { txns } of buckets) {
    for (let i = 0; i < txns.txn_idx.length; i++) {
      if (txns.slot[i] === slot && txns.txn_idx[i] === txnIdx) {
        return { txns, i };
      }
    }
  }
  return undefined;
}

/** Locate a selected txn's row within the revenue meta bucket cache. */
export function findTxnMeta(
  buckets: TxnMetaBucket[],
  slot: number,
  txnIdx: number,
): { txns: TxnMetaColumns; i: number } | undefined {
  for (const { txns } of buckets) {
    for (let i = 0; i < txns.txn_idx.length; i++) {
      if (txns.slot[i] === slot && txns.txn_idx[i] === txnIdx) {
        return { txns, i };
      }
    }
  }
  return undefined;
}
