import { getDefaultStore } from "jotai";
import { liveTileRowAtomFamily, type TileRowMetrics } from "./atoms";
import tableStyles from "../../../components/dataTable.module.css";
import { PriorityEnum } from "../../../api/entities";
import { useLayoutEffect } from "react";

const store = getDefaultStore();

/**
 * Each component subscribes to the relevant state in the Jotai store.
 * This allows for fine-grained updates without re-rendering through react.
 */

export type WriteEl<E extends HTMLElement> = (
  el: E,
  cur: TileRowMetrics | undefined,
  prev: TileRowMetrics | undefined,
) => void;

export function useRowState<E extends HTMLElement>(
  idx: number,
  ref: { current: E | null },
  write: WriteEl<E>,
) {
  useLayoutEffect(() => {
    const rowAtom = liveTileRowAtomFamily(idx);
    let prev = store.get(rowAtom);

    const handleUpdate = () => {
      const cur = store.get(rowAtom);
      if (ref.current) write(ref.current, cur, prev);
      prev = cur;
    };

    const unsub = store.sub(rowAtom, handleUpdate);
    handleUpdate();
    return unsub;
  }, [idx, ref, write]);
}

// alive === 2 (shutdown) or no timers -> row hidden.
export const writeRow: WriteEl<HTMLTableRowElement> = (el, c, p) => {
  const alive = c?.alive ?? p?.alive;
  const hasTimers = !!(c?.timers || p?.timers);
  const priority = c?.priority ?? p?.priority;
  el.style.display = alive === 2 || !hasTimers ? "none" : "";
  el.classList.toggle(tableStyles.faded, priority === PriorityEnum.floating);
};
