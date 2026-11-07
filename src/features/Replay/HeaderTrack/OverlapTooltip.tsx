import { getDefaultStore, useAtomValue } from "jotai";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useUnmount } from "react-use";
import { computePosition, offset, flip, shift } from "@floating-ui/dom";
import { containerElAtom } from "../../../atoms";
import { useAtomsSubscription } from "../../../atomUtils";
import RowSeparator from "../../../components/RowSeparator";
import PeerIcon from "../../../components/PeerIcon";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import {
  dismissPinnedAtom,
  dismissPinnedIfOffscreenAtom,
  freezeOverlapAtom,
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
import type { SlotInfo } from "./nonAggAtoms";
import { SlotStatus } from "./SlotStatus";
import { SlotTooltipContent } from "./ReplaySlotTooltip";
import { NON_AGG_TRACK_ID } from "./const";
import styles from "./overlapTooltip.module.css";

const store = getDefaultStore();

const POINTER_GAP_PX = 6;
const EDGE_MARGIN_PX = 8;
// How long to keep the list open after returning from detail before leave-dismissal resumes.
const DETAIL_RETURN_GRACE_MS = 1500;
const logoSize = 10;
const HIT_PADDING_PX = 24;

/** the non-agg header track element, or null if not mounted */
function getTrackEl(): Element | null {
  return document.getElementById(NON_AGG_TRACK_ID);
}

/** whether a viewport point falls inside an element's rect, expanded by padding */
function pointInEl(
  el: Element | null,
  x: number,
  y: number,
  padding = 0,
): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return (
    x >= r.left - padding &&
    x <= r.right + padding &&
    y >= r.top - padding &&
    y <= r.bottom + padding
  );
}

/** the slot whose screen position anchors the tooltip */
function getAnchorSlotInfo(
  pinned: PinnedTooltip,
  list: SlotInfo[],
): SlotInfo | undefined {
  // detail mode anchors on the selected slot; list mode on the anchor slot
  const slot =
    pinned.mode === "detail" && pinned.selectedSlot != null
      ? pinned.selectedSlot
      : pinned.anchorSlot;
  return list.find((s) => s.slot === slot);
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
  const listRectRef = useRef<DOMRect | null>(null);
  // Keep overlap tooltip open when transitioning back from slot detail tooltip
  const keepOpenOnLeaveRef = useRef(false);
  const keepOpenTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const reposition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const pinned = store.get(pinnedTooltipAtom);
    const visibleRange = store.get(visibleRangeAtom);
    const trackEl = getTrackEl();
    const trackRect = trackEl?.getBoundingClientRect();
    if (!pinned || !visibleRange || !trackRect) {
      root.style.visibility = "hidden";
      return;
    }

    const place = (x: number, y: number) => {
      if (store.get(pinnedTooltipAtom) == null) return;
      root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      root.style.visibility = "visible";
    };

    // Detail tooltip anchors to the right edge of where the list was
    if (pinned.mode === "detail" && listRectRef.current) {
      const listRect = listRectRef.current;
      void computePosition({ getBoundingClientRect: () => listRect }, root, {
        strategy: "fixed",
        placement: "right-start",
        middleware: [
          offset(POINTER_GAP_PX),
          flip(),
          shift({ padding: EDGE_MARGIN_PX }),
        ],
      }).then(({ x, y }) => place(x, y));
      return;
    }

    // Anchor under the anchor slot's start, falling back to the cursor ts. Re-runs
    // on every ts change, so a live list tracks the cursor and a frozen one stays put.
    const anchorInfo = getAnchorSlotInfo(
      pinned,
      store.get(overlappingSlotsAtom),
    );
    const anchorMs = anchorInfo ? anchorInfo.startMs : pinned.ts;
    const anchorX = msToClientX(anchorMs, trackRect, visibleRange);
    const anchorY = trackRect.bottom;

    const anchor = {
      x: anchorX,
      y: anchorY,
      left: anchorX,
      right: anchorX,
      top: anchorY,
      bottom: anchorY,
      width: 0,
      height: 0,
    };

    void computePosition({ getBoundingClientRect: () => anchor }, root, {
      strategy: "fixed",
      placement: "bottom-start",
      middleware: [
        offset(POINTER_GAP_PX),
        flip(),
        shift({ padding: EDGE_MARGIN_PX }),
      ],
    }).then(({ x, y }) => {
      place(x, y);
      if (store.get(pinnedTooltipAtom)?.mode === "list") {
        listRectRef.current = root.getBoundingClientRect();
      }
    });
  }, []);

  // Reposition on ts/mode change. Not subscribed to the visible range, so frozen
  // tooltips stay put.
  useAtomsSubscription([pinnedTooltipAtom], reposition);

  useLayoutEffect(() => {
    let prevMode = store.get(pinnedTooltipAtom)?.mode;
    const clearKeepOpenTimer = () => clearTimeout(keepOpenTimerRef.current);
    return store.sub(pinnedTooltipAtom, () => {
      const mode = store.get(pinnedTooltipAtom)?.mode;
      if (mode === prevMode) return;

      clearKeepOpenTimer();
      keepOpenOnLeaveRef.current = !(mode === "list" && prevMode !== "detail");
      if (mode === "list" && prevMode === "detail") {
        keepOpenTimerRef.current = setTimeout(() => {
          keepOpenOnLeaveRef.current = false;
        }, DETAIL_RETURN_GRACE_MS);
      }
      prevMode = mode;
    });
  }, []);

  useUnmount(() => clearTimeout(keepOpenTimerRef.current));

  useLayoutEffect(() => {
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [reposition]);

  // Close tooltip if ts is outside visible range
  useLayoutEffect(() => {
    return store.sub(visibleRangeAtom, () => {
      store.set(dismissPinnedIfOffscreenAtom);
    });
  }, []);

  // Close behavior by mode:
  // - list: close when the cursor leaves both header and tooltip (padding bridges
  //   the gap so the cursor can cross between them).
  // - detail: ignore hover; close only on click-away / Esc.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (store.get(pinnedTooltipAtom)?.mode !== "list") return;
      const overTooltip = pointInEl(
        rootRef.current,
        e.clientX,
        e.clientY,
        HIT_PADDING_PX,
      );
      const overHeader = pointInEl(
        getTrackEl(),
        e.clientX,
        e.clientY,
        HIT_PADDING_PX,
      );
      if (overTooltip || overHeader) {
        clearTimeout(keepOpenTimerRef.current);
        keepOpenOnLeaveRef.current = false;
        return;
      }
      if (!keepOpenOnLeaveRef.current) {
        store.set(dismissPinnedAtom, { x: e.clientX, y: e.clientY });
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (store.get(pinnedTooltipAtom)?.mode !== "detail") return;
      const root = rootRef.current;
      if (root && e.target instanceof Node && root.contains(e.target)) return;
      store.set(dismissPinnedAtom, { x: e.clientX, y: e.clientY });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") store.set(dismissPinnedAtom);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
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
      className={styles.pinnedTooltip}
      onMouseEnter={() => store.set(freezeOverlapAtom)}
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
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={isSelected ? styles.rowSelected : styles.row}
      onClick={() => store.set(selectPinnedSlotAtom, slot)}
      onMouseEnter={() => {
        setIsHovered(true);
        store.set(pinnedHoverRowAtom, slot);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        store.set(pinnedHoverRowAtom, undefined);
      }}
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
      {isHovered && <span className={styles.rowInFront}>in front</span>}
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
