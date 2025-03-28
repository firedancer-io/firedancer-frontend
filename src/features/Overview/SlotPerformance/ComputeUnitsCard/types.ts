export type ZoomRange =
  | readonly [number, number]
  | readonly [number, undefined];

export type Domain = readonly [number, number];

export type TransactionMeta = {
  transactionIndex: number;
  startTimestampNanos: number;
  endTimestampNanos: number;
  endLoadTimestampNanos: number;
  endExecTimestampNanos: number;
  computeUnitsEstimated: number;
  computeUnitsRebated: number;
  priorityFeeLamports: bigint;
  lamportsPerCu: number;
  tips: bigint;
  errorCode: number;
  fromBundle: boolean;
  isVote: boolean;
  bankIndex: number;
};
