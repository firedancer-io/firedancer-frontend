import type { EstimatedTps } from "../../../api/types";
import { atomWithImmer } from "jotai-immer";
import { maxTransactionChartPoints } from "./consts";

export const tpsDataAtom = atomWithImmer<(EstimatedTps | undefined)[]>(
  new Array<undefined>(maxTransactionChartPoints).fill(undefined),
);
