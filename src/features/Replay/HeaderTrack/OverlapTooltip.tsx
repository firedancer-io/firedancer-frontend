import { getDefaultStore, useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useUnmount } from "react-use";
import clsx from "clsx";
import { containerElAtom } from "../../../atoms";
import { useAtomsSubscription } from "../../../atomUtils";
import RowSeparator from "../../../components/RowSeparator";
import PeerIcon from "../../../components/PeerIcon";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import {
  clearPinnedReentryGateAtom,
  dismissPinnedAtom,
  nonAggHeaderElAtom,
  overlappingSlotsAtom,
  pinnedBackToListAtom,
  pinnedHoverRowAtom,
  pinnedSelectedIdxAtom,
  pinnedSelectedSlotInfoAtom,
  pinnedStepAtom,
  pinnedTooltipAtom,
  referenceNsAtom,
  selectPinnedSlotAtom,
  visibleRangeAtom,
  type PinnedTooltip,
} from "../atoms";
import { msToClientX } from "../utils";
import { positionBelowPoint, positionBesideSpan } from "../floatingPosition";
import type { SlotInfo } from "./nonAggAtoms";
import { SlotStatus } from "./SlotStatus";
import { SlotTooltipContent } from "./ReplaySlotTooltip";
import styles from "./overlapTooltip.module.css";
import chartStyles from "../chart.module.css";

const store = getDefaultStore();

const POINTER_GAP_PX = 6;
const LIST_OFFSET_X_PX = 5;
const logoSize = 10;
const HIT_PADDING_PX = 24;

/** whether a viewport point falls inside a cached rect, expanded by padding */
function pointInRect(
  r: DOMRect | null,
  x: number,
  y: number,
  padding = 0,
): boolean {
  if (!r) return false;
  return (
    x >= r.left - padding &&
    x <= r.right + padding &&
    y >= r.top - padding &&
    y <= r.bottom + padding
  );
}

/** the list-mode slot whose screen position anchors the tooltip */
function getAnchorSlotInfo(
  pinned: PinnedTooltip,
  list: SlotInfo[],
): SlotInfo | undefined {
  return list.find((s) => s.slot === pinned.anchorSlot);
}

export default function OverlapTooltip() {
  const pinned = useAtomValue(pinnedTooltipAtom);
  const portalTarget = useAtomValue(containerElAtom);

  useUnmount(() => store.set(dismissPinnedAtom));

  if (!pinned || !portalTarget) return null;

  return createPortal(<PinnedShell />, portalTarget);
}

function PinnedShell() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  // cached rects, refreshed each reposition
  const rootRectRef = useRef<DOMRect | null>(null);
  const trackRectRef = useRef<DOMRect | null>(null);
  // list's left/right edges as x offsets from the detail slot, fixed when detail opens
  const detailOffsetXRef = useRef<{ left: number; right: number } | null>(null);
  // positioning is async; only the latest call may place the tooltip
  const repositionIdRef = useRef(0);

  // open detail beside the list, and keep that offset from the slot
  const captureDetailOffsetX = useCallback((pinned: PinnedTooltip) => {
    const listRect = rootRectRef.current;
    const visibleRange = store.get(visibleRangeAtom);
    const trackRect = trackRectRef.current;
    if (
      !listRect ||
      !visibleRange ||
      !trackRect ||
      pinned.selectedSlot == null
    ) {
      detailOffsetXRef.current = null;
      return;
    }
    const slotInfo = store
      .get(overlappingSlotsAtom)
      .find((s) => s.slot === pinned.selectedSlot);
    const anchorMs = slotInfo ? slotInfo.startMs : pinned.ts;
    const slotX = msToClientX(anchorMs, trackRect, visibleRange);
    detailOffsetXRef.current = {
      left: listRect.left - slotX,
      right: listRect.right - slotX,
    };
  }, []);

  const reposition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const repositionId = ++repositionIdRef.current;
    const pinned = store.get(pinnedTooltipAtom);
    const visibleRange = store.get(visibleRangeAtom);
    const trackRect = store.get(nonAggHeaderElAtom)?.getBoundingClientRect();
    trackRectRef.current = trackRect ?? null;
    if (!pinned || !visibleRange || !trackRect) {
      root.style.visibility = "hidden";
      return;
    }

    const place = (x: number, y: number) => {
      if (repositionId !== repositionIdRef.current) return;
      if (store.get(pinnedTooltipAtom) == null) return;
      root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      root.style.visibility = "visible";
      rootRectRef.current = root.getBoundingClientRect();
    };

    // follow the selected slot (detail) or anchor slot (list), else the cursor ts
    const list = store.get(overlappingSlotsAtom);
    const isDetail = pinned.mode === "detail" && pinned.selectedSlot != null;
    const anchorInfo = isDetail
      ? list.find((s) => s.slot === pinned.selectedSlot)
      : getAnchorSlotInfo(pinned, list);
    const anchorMs = anchorInfo ? anchorInfo.startMs : pinned.ts;
    const slotX = msToClientX(anchorMs, trackRect, visibleRange);

    const detailOffsetX = isDetail ? detailOffsetXRef.current : null;
    const position = detailOffsetX
      ? // right of where the list was, or left of it if there isn't room
        positionBesideSpan(
          {
            left: slotX + detailOffsetX.left,
            right: slotX + detailOffsetX.right,
            y: trackRect.bottom + POINTER_GAP_PX,
          },
          root,
        )
      : positionBelowPoint(
          { x: slotX + LIST_OFFSET_X_PX, y: trackRect.bottom },
          root,
          POINTER_GAP_PX,
        );
    void position.then(({ x, y }) => place(x, y));
  }, []);

  // Tooltip stays with its slot during live playback and panning.
  useAtomsSubscription([visibleRangeAtom], reposition);

  // capture the detail offset from the list's position before repositioning
  useLayoutEffect(() => {
    let prevMode = store.get(pinnedTooltipAtom)?.mode;
    return store.sub(pinnedTooltipAtom, () => {
      const pinned = store.get(pinnedTooltipAtom);
      const mode = pinned?.mode;
      if (mode !== prevMode) {
        if (mode === "detail" && prevMode === "list" && pinned) {
          captureDetailOffsetX(pinned);
        } else if (mode !== "detail") {
          detailOffsetXRef.current = null;
        }
        prevMode = mode;
      }
      reposition();
    });
  }, [captureDetailOffsetX, reposition]);

  useLayoutEffect(() => {
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [reposition]);

  // Close behavior by mode:
  // - list: close when the cursor leaves both header and tooltip (padding bridges
  //   the gap so the cursor can cross between them). After a detail→list return,
  //   it stays open until the cursor is seen over one of them.
  // - both: close on a click outside the tooltip, except on the header in list
  //   mode. That click only closes it and doesn't reach the chart.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (store.get(pinnedTooltipAtom)?.mode !== "list") return;
      const overTooltip = pointInRect(
        rootRectRef.current,
        e.clientX,
        e.clientY,
        HIT_PADDING_PX,
      );
      const overHeader = pointInRect(
        trackRectRef.current,
        e.clientX,
        e.clientY,
        HIT_PADDING_PX,
      );
      if (overTooltip || overHeader) {
        // cursor is back over the tooltip/header: re-entry satisfied
        store.set(clearPinnedReentryGateAtom);
        return;
      }
      if (!store.get(pinnedTooltipAtom)?.suppressLeaveUntilReentry) {
        store.set(dismissPinnedAtom);
      }
    };
    const onMouseDownCapture = (e: MouseEvent) => {
      const mode = store.get(pinnedTooltipAtom)?.mode;
      if (mode == null) return;
      const root = rootRef.current;
      // clicks inside the tooltip never dismiss
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      if (
        mode === "list" &&
        pointInRect(
          store.get(nonAggHeaderElAtom)?.getBoundingClientRect() ?? null,
          e.clientX,
          e.clientY,
        )
      ) {
        return;
      }
      store.set(dismissPinnedAtom);
      // stop the chart's mousedown gesture so this click only closes the tooltip,
      // without also selecting/pausing
      e.stopPropagation();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("mousedown", onMouseDownCapture, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("mousedown", onMouseDownCapture, true);
    };
  }, []);

  const setRootRef = useCallback(
    (root: HTMLDivElement | null) => {
      rootRef.current = root;
      observerRef.current?.disconnect();
      if (!root) return;
      reposition();
      observerRef.current = new ResizeObserver(() => reposition());
      observerRef.current.observe(root);
    },
    [reposition],
  );

  const mode = useAtomValue(pinnedTooltipAtom)?.mode;

  return (
    <div
      ref={setRootRef}
      className={clsx(styles.pinnedTooltip, chartStyles.noChartExplore)}
      // keeps presses here from clearing the selected slot (useDismissSelection)
      data-replay-popup
    >
      {mode === "detail" ? <DetailView /> : <ListView />}
    </div>
  );
}

function ListView() {
  const list = useAtomValue(overlappingSlotsAtom);
  const selectedIdx = useAtomValue(pinnedSelectedIdxAtom);

  return (
    <>
      <div className={styles.listHeader}>
        <span className={styles.listTitle}>
          {list.length} slots overlap here
        </span>
      </div>
      <div className={styles.list}>
        {list.map((slotInfo, idx) => (
          <OverlapRow
            key={slotInfo.slot}
            slotInfo={slotInfo}
            isSelected={idx === selectedIdx}
          />
        ))}
      </div>
    </>
  );
}

interface OverlapRowProps {
  slotInfo: SlotInfo;
  isSelected: boolean;
}

const OverlapRow = memo(function OverlapRow({
  slotInfo,
  isSelected,
}: OverlapRowProps) {
  const { slot, isSkipped } = slotInfo;
  const { name, peer, isLeader } = useSlotInfo(slot);

  return (
    <div
      className={isSelected ? styles.rowSelected : styles.row}
      onClick={() => store.set(selectPinnedSlotAtom, slot)}
      onMouseEnter={() => store.set(pinnedHoverRowAtom, slot)}
      onMouseLeave={() => store.set(pinnedHoverRowAtom, undefined)}
    >
      <span className={styles.rowStatus}>
        <SlotStatus slot={slot} skipped={isSkipped} />
      </span>
      <span className={styles.rowSlot}>{slot}</span>
      <PeerIcon
        url={peer?.info?.icon_url}
        size={logoSize}
        isYou={isLeader}
        hideTooltip
      />
      <span className={styles.rowName}>
        {isLeader ? `You · ${name}` : name}
      </span>
      <span className={styles.rowInFront}>in front</span>
    </div>
  );
});

function DetailView() {
  const list = useAtomValue(overlappingSlotsAtom);
  const idx = useAtomValue(pinnedSelectedIdxAtom);
  const slotInfo = useAtomValue(pinnedSelectedSlotInfoAtom);
  const referenceNs = useAtomValue(referenceNsAtom);

  // slot not there, so fallback to list
  const missing = slotInfo == null || referenceNs == null;
  useEffect(() => {
    if (missing) store.set(pinnedBackToListAtom);
  }, [missing]);
  if (missing) return null;

  return (
    <>
      <div className={styles.nav}>
        <button
          className={styles.navBack}
          onClick={() => store.set(pinnedBackToListAtom)}
        >
          ☰ All {list.length}
        </button>
        <div className={styles.navRight}>
          <span className={styles.navPosition}>
            {idx + 1} of {list.length}
          </span>
          <button
            className={styles.navStep}
            disabled={idx <= 0}
            onClick={() => store.set(pinnedStepAtom, -1)}
          >
            ‹
          </button>
          <button
            className={styles.navStep}
            disabled={idx >= list.length - 1}
            onClick={() => store.set(pinnedStepAtom, 1)}
          >
            ›
          </button>
        </div>
      </div>
      <RowSeparator />
      <SlotTooltipContent slotInfo={slotInfo} referenceNs={referenceNs} />
    </>
  );
}
