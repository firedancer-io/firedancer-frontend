import { atom } from "jotai";
import { TransactionMeta, ZoomRange } from "./types";

type TriggerZoom = (action: "in" | "out" | "reset") => void;

export const triggerZoomAtom = (function () {
  const triggerZoom = atom<TriggerZoom>();

  return atom(
    (get) => get(triggerZoom) ?? (() => 0),
    (get, set, _triggerZoom: TriggerZoom) => {
      set(triggerZoom, () => _triggerZoom);
    },
  );
})();

export const fitYToDataAtom = atom(false);

export const zoomRangeAtom = atom<ZoomRange>();

export const isMaxZoomRangeAtom = atom(false);

export const dragRangeAtom = atom<[number, number]>();
export const isDraggingAtom = atom((get) => get(dragRangeAtom) !== undefined);
export const isActiveDraggingAtom = atom((get) => {
  const dragRange = get(dragRangeAtom);
  return dragRange !== undefined && dragRange[0] !== dragRange[1];
});

export const clickedTransactionAtom = atom<TransactionMeta[]>([
  {
    transactionIndex: 123,
    startTimestampNanos: 12345,
    endTimestampNanos: 52345,
    endLoadTimestampNanos: 22345,
    endExecTimestampNanos: 32345,
    computeUnitsEstimated: 100,
    computeUnitsRebated: 10,
    priorityFeeLamports: BigInt(100),
    lamportsPerCu: 1,
    tips: BigInt(100),
    errorCode: 0,
    fromBundle: true,
    isVote: false,
    bankIndex: 0,
  } as TransactionMeta,
]);
