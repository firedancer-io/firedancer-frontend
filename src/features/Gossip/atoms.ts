import { atom } from "jotai";
import { SortOptions } from "./types";

export const gossipSearchAtom = atom("");

export const gossipSortAtom = atom<SortOptions>(SortOptions.StakeWeightDsc);
