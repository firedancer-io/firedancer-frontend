import type { ReactNode } from "react";
import { Fragment, useCallback, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getDefaultStore, useAtomValue } from "jotai";
import { DateTime } from "luxon";
import { startCase } from "lodash";
import {
  computePosition,
  offset,
  flip,
  shift,
  type VirtualElement,
} from "@floating-ui/dom";
import { containerElAtom } from "../../../atoms";
import { nsPerMs, solDecimals } from "../../../consts";
import { feesColor, incomeColor, tipsColor } from "../../../colors";
import { useAtomsSubscription } from "../../../atomUtils";
import RowSeparator from "../../../components/RowSeparator";
import { useSlotQueryPublish } from "../../../hooks/useSlotQuery";
import { useSlotInfo } from "../../../hooks/useSlotInfo";
import { formatNumberLamports } from "../../Overview/ValidatorsCard/formatAmt";
import { timelineShredsAtoms } from "../ShredsTrack/atoms";
import {
  hoveredSlotAtom,
  hoveredClientPosAtom,
  hoveredSlotInfoAtom,
  referenceNsAtom,
} from "../atoms";
import { calcAbsoluteNs } from "../utils";
import type { SlotInfo } from "./nonAggAtoms";
import { useSlotLevel } from "./useSlotLevel";
import styles from "./hoveredSlotTooltip.module.css";

const store = getDefaultStore();

// 16px gap from the cursor
const POINTER_GAP_PX = 16;
// 8px from the viewport edge
const EDGE_MARGIN_PX = 8;

const MISSING = "—";

/**
 * Slot info tooltip
 */
export default function HoveredSlotTooltip() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  // the slot whose content is currently committed to the DOM; the subscription
  // path only reveals once this matches the hovered slot, so it never reveals a
  // box that hasn't rendered its content yet (the none -> hovered flash)
  const renderedSlotRef = useRef<number>();

  const reposition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const hovered = store.get(hoveredSlotAtom);
    const clientPos = store.get(hoveredClientPosAtom);

    if (hovered === undefined || clientPos === undefined) {
      // hidden (not display:none) so the next hover can measure/position it
      // while invisible, avoiding a flash before computePosition resolves
      root.style.visibility = "hidden";
      return;
    }

    // zero-size anchor at the cursor, in viewport coords
    const anchorX = clientPos.x;
    const anchorY = clientPos.y;
    const virtualEl: VirtualElement = {
      getBoundingClientRect: () => ({
        x: anchorX,
        y: anchorY,
        width: 0,
        height: 0,
        left: anchorX,
        right: anchorX,
        top: anchorY,
        bottom: anchorY,
      }),
    };

    void computePosition(virtualEl, root, {
      // strategy "fixed" so x/y are viewport-relative
      strategy: "fixed",
      placement: "top-start",
      middleware: [
        offset(POINTER_GAP_PX),
        flip(),
        shift({ padding: EDGE_MARGIN_PX }),
      ],
    }).then(({ x, y }) => {
      // hover may have cleared while the promise was pending
      if (store.get(hoveredClientPosAtom) == null) return;

      root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;

      // reveal only once positioned AND the box holds the hovered slot's content
      if (renderedSlotRef.current === hovered) {
        root.style.visibility = "visible";
      }
    });
  }, []);

  useAtomsSubscription([hoveredSlotAtom, hoveredClientPosAtom], reposition);

  const slotInfo = useAtomValue(hoveredSlotInfoAtom);

  // Reposition after the content for a new slot has actually rendered
  useLayoutEffect(() => {
    renderedSlotRef.current = slotInfo?.slot;
    reposition();
  }, [slotInfo?.slot, reposition]);

  const portalTarget = useAtomValue(containerElAtom);
  if (!portalTarget) return null;

  return createPortal(
    <div ref={rootRef} className={styles.tooltip}>
      {slotInfo && <SlotTooltipContent slotInfo={slotInfo} />}
    </div>,
    portalTarget,
  );
}

interface TooltipRow {
  label: string;
  value: ReactNode;
  unit?: string;
  color?: string;
}

/**
 * Slot tooltip content
 */
function SlotTooltipContent({ slotInfo }: { slotInfo: SlotInfo }) {
  const { slot, startMs, endMs, isSkipped } = slotInfo;

  const referenceNs = useAtomValue(referenceNsAtom);
  const { name, isLeader } = useSlotInfo(slot);
  const level = useSlotLevel(slot, isSkipped);
  const { publish } = useSlotQueryPublish(slot);
  const slotsShreds = useAtomValue(timelineShredsAtoms.slotsShreds);

  const startTime =
    referenceNs === undefined
      ? MISSING
      : DateTime.fromMillis(
          Number(calcAbsoluteNs(referenceNs, startMs) / BigInt(nsPerMs)),
        ).toFormat("h:mm:ss.SSS");

  const durationMs = Math.round(endMs - startMs);

  const shredCount = slotsShreds?.slots.get(slot)?.shreds.length;

  const feesLamports = sumLamports(
    publish?.priority_fee,
    publish?.transaction_fee,
  );
  const tipsLamports = publish?.tips ?? undefined;
  const incomeLamports = sumLamports(feesLamports, tipsLamports);

  const sections: TooltipRow[][] = [
    [
      { label: "Leader", value: isLeader ? `You · ${name}` : name },
      { label: "Status", value: startCase(level) },
    ],
    [
      { label: "Started", value: startTime },
      { label: "Duration", value: durationMs, unit: "ms" },
    ],
    [
      { label: "Shreds", value: shredCount ?? MISSING },
      {
        label: "Transactions",
        value: publish?.success_transaction_cnt ?? MISSING,
      },
      { label: "Failed", value: publish?.failed_transaction_cnt ?? MISSING },
    ],
    [
      {
        label: "Income",
        value: formatSol(incomeLamports),
        unit: "SOL",
        color: incomeColor,
      },
      {
        label: "Fees",
        value: formatSol(feesLamports),
        unit: "SOL",
        color: feesColor,
      },
      {
        label: "Tips",
        value: formatSol(tipsLamports),
        unit: "SOL",
        color: tipsColor,
      },
    ],
  ];

  return (
    <>
      <div className={styles.header} data-skipped={isSkipped || undefined}>
        Slot {slot}
      </div>
      {sections.map((rows, i) => (
        <Fragment key={i}>
          <RowSeparator />
          {rows.map((row) => (
            <div key={row.label} className={styles.row}>
              <span className={styles.label}>{row.label}</span>
              <span className={styles.value} style={{ color: row.color }}>
                {row.value}
                {row.unit != null && (
                  <span className={styles.unit}>{row.unit}</span>
                )}
              </span>
            </div>
          ))}
        </Fragment>
      ))}
    </>
  );
}

/** add two nullable lamport amounts; undefined if both are missing */
function sumLamports(a?: bigint | null, b?: bigint | null) {
  if (a == null && b == null) return undefined;
  return (a ?? 0n) + (b ?? 0n);
}

/** format lamports to SOL string, or the dash placeholder when missing */
function formatSol(lamports?: bigint) {
  if (lamports === undefined) return MISSING;
  return formatNumberLamports(lamports, solDecimals, {
    decimals: solDecimals,
    trailingZeroes: true,
  });
}
