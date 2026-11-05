import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { isAlpenglowAtom, voteStateAtom } from "../../../api/atoms";
import { isVotesTrackAvailableAtom, votesMissingStakeAtom } from "./atoms";

function storeWith(isAlpenglow: boolean | undefined) {
  const store = createStore();
  store.set(isAlpenglowAtom, isAlpenglow);
  return store;
}

describe("isVotesTrackAvailableAtom", () => {
  it("is available on a voting Alpenglow node", () => {
    const store = storeWith(true);
    store.set(voteStateAtom, "voting");
    expect(store.get(isVotesTrackAvailableAtom)).toBe(true);
  });

  it("is unavailable without Alpenglow", () => {
    expect(storeWith(false).get(isVotesTrackAvailableAtom)).toBe(false);
    expect(storeWith(undefined).get(isVotesTrackAvailableAtom)).toBe(false);
  });

  it("is unavailable on a non-voting node", () => {
    const store = storeWith(true);
    store.set(voteStateAtom, "non-voting");
    expect(store.get(isVotesTrackAvailableAtom)).toBe(false);
  });

  it("is unavailable once a response had votes without total stake", () => {
    const store = storeWith(true);
    store.set(votesMissingStakeAtom, true);
    expect(store.get(isVotesTrackAvailableAtom)).toBe(false);
  });
});
