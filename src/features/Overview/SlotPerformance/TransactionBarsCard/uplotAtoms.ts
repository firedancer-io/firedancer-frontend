import { atom } from "jotai";
import type uPlot from "uplot";
import { uplotActionAtom } from "../../../../uplotReact/uplotAtoms";
import { txnBarsUplotIdPrefix } from "./consts";

export const txnBarsUplotActionAtom = atom(
  null,
  (get, set, action: (u: uPlot, bankIdx: number) => void) => {
    function isMatchingChartId(chartId: string) {
      return chartId.startsWith("bank-");
    }

    function actionWithBankIdx(u: uPlot, id: string) {
      const bankIdx = Number(id.replace(txnBarsUplotIdPrefix, ""));
      if (!isNaN(bankIdx)) {
        action(u, bankIdx);
      }
    }

    set(uplotActionAtom, actionWithBankIdx, { isMatchingChartId });
  },
);
