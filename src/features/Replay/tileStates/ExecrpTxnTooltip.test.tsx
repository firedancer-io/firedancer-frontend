import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { TileState } from "../../../api/entities";
import { containerElAtom } from "../../../atoms";
import { hoveredExecrpTxnAtom, type HoveredExecrpTxn } from "../atoms";
import tooltipStyles from "../Tooltip/replayCursorTooltip.module.css";
import ExecrpTxnTooltip from "./ExecrpTxnTooltip";

const store = getDefaultStore();
let portalEl: HTMLDivElement;

function hoveredTxn(txnIdx: number, executeMs: number): HoveredExecrpTxn {
  return {
    slot: 10,
    txnIdx,
    ms: 0,
    state: TileState.Execute,
    states: {
      exec: {
        tileIdx: 0,
        startMs: 0,
        endMs: executeMs,
        errorCode: 0,
        stateMs: new Map([[TileState.Execute, executeMs]]),
      },
      sigverify: undefined,
    },
  };
}

const getTooltipEl = () =>
  portalEl.getElementsByClassName(tooltipStyles.tooltip)[0];

beforeEach(() => {
  // jsdom has no ResizeObserver; the tooltip uses it to reposition
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  portalEl = document.createElement("div");
  document.body.appendChild(portalEl);
  store.set(containerElAtom, portalEl);
});

afterEach(() => {
  cleanup();
  store.set(hoveredExecrpTxnAtom, undefined);
  store.set(containerElAtom, null);
  portalEl.remove();
  vi.unstubAllGlobals();
});

describe("ExecrpTxnTooltip", () => {
  it("keeps the same tooltip element when moving straight to another txn", () => {
    render(<ExecrpTxnTooltip />);
    act(() => store.set(hoveredExecrpTxnAtom, hoveredTxn(1, 2)));
    const tooltipEl = getTooltipEl();
    expect(tooltipEl).toBeDefined();

    act(() => store.set(hoveredExecrpTxnAtom, hoveredTxn(2, 3)));
    expect(getTooltipEl()).toBe(tooltipEl);
  });

  it("updates when the hovered txn's durations change", () => {
    store.set(hoveredExecrpTxnAtom, hoveredTxn(1, 2));
    const before = store.get(hoveredExecrpTxnAtom);

    store.set(hoveredExecrpTxnAtom, hoveredTxn(1, 2));
    expect(store.get(hoveredExecrpTxnAtom)).toBe(before);

    store.set(hoveredExecrpTxnAtom, hoveredTxn(1, 5));
    expect(store.get(hoveredExecrpTxnAtom)).not.toBe(before);
  });
});
