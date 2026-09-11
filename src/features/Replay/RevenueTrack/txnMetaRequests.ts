import type { TimelineTxnMeta } from "../../../api/types";

export type TxnMetaResult = { value: TimelineTxnMeta } | { errorCode: string };

const pending = new Map<number, (result: TxnMetaResult) => void>();

export function awaitTxnMetaResponse(id: number): Promise<TxnMetaResult> {
  pending.get(id)?.({ errorCode: "superseded" });

  return new Promise((resolve) => {
    pending.set(id, (result) => {
      pending.delete(id);
      resolve(result);
    });
  });
}

export function resolveTxnMetaRequest(id: number, result: TxnMetaResult): void {
  pending.get(id)?.(result);
}

export function failAllTxnMetaRequests(errorCode: string): void {
  const resolvers = [...pending.values()];
  pending.clear();
  for (const resolve of resolvers) resolve({ errorCode });
}
