import type { PropsWithChildren, ReactNode } from "react";
import { memo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { getDefaultStore, useAtomValue } from "jotai";
import { computePosition, offset, flip, shift } from "@floating-ui/dom";
import MonoText from "../../../components/MonoText";
import { containerElAtom } from "../../../atoms";
import { useAtomsSubscription } from "../../../atomUtils";
import { DateTime } from "luxon";
import { nsPerMs } from "../../../consts";
import { hoveredClientPosAtom, hoveredMsAtom, referenceNsAtom } from "../atoms";
import { calcAbsoluteNs } from "../utils";
import styles from "./replayCursorTooltip.module.css";

const store = getDefaultStore();

// 16px gap from the cursor
const POINTER_GAP_PX = 16;
// 8px from the viewport edge
const EDGE_MARGIN_PX = 8;

/**
 * Tooltip that follows the cursor on the replay page. Mount it only when its
 * content is ready (the consumer gates on that): the box is then never empty,
 * and it mounts hidden (CSS) until positioned, so it never flashes.
 */
export default function ReplayCursorTooltip({ children }: PropsWithChildren) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  const reposition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const pos = store.get(hoveredClientPosAtom);
    if (pos == null) {
      root.style.visibility = "hidden";
      return;
    }

    // zero-size anchor at the cursor, in viewport coords
    const anchor = {
      x: pos.x,
      y: pos.y,
      left: pos.x,
      right: pos.x,
      top: pos.y,
      bottom: pos.y,
      width: 0,
      height: 0,
    };

    void computePosition({ getBoundingClientRect: () => anchor }, root, {
      // strategy "fixed" so x/y are viewport-relative
      strategy: "fixed",
      // prefer below the cursor
      placement: "bottom-start",
      middleware: [
        offset(POINTER_GAP_PX),
        flip(),
        shift({ padding: EDGE_MARGIN_PX }),
      ],
    }).then(({ x, y }) => {
      // return if hover was cleared while the promise was pending
      if (store.get(hoveredClientPosAtom) == null) return;

      root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      root.style.visibility = "visible";
    });
  }, []);

  useAtomsSubscription([hoveredClientPosAtom], reposition);

  const setRootRef = useCallback(
    (root: HTMLDivElement | null) => {
      rootRef.current = root;

      observerRef.current?.disconnect();
      if (!root) return;

      reposition();

      // reposition on content size change
      observerRef.current = new ResizeObserver(() => reposition());
      observerRef.current.observe(root);
    },
    [reposition],
  );

  const portalTarget = useAtomValue(containerElAtom);
  if (!portalTarget) return null;

  return createPortal(
    <div ref={setRootRef} className={styles.tooltip}>
      {children}
    </div>,
    portalTarget,
  );
}

interface TooltipHeaderProps {
  colorClassName?: string;
}

export const TooltipHeader = memo(function TooltipHeader({
  children,
  colorClassName,
}: PropsWithChildren<TooltipHeaderProps>) {
  return (
    <div
      className={clsx(
        styles.header,
        colorClassName ?? styles.defaultHeaderColor,
      )}
    >
      {children}
    </div>
  );
});

interface TooltipRowProps {
  label: string;
  value: ReactNode;
  /** trailing unit (e.g. "ms", "SOL"), shown after a space */
  unit?: string;
  valueColorClassName?: string;
}

export const TooltipRow = memo(function TooltipRow({
  label,
  value,
  unit,
  valueColorClassName,
}: TooltipRowProps) {
  const isMissing = value == null;
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={valueColorClassName ?? styles.defaultValueColor}>
        {isMissing ? "—" : value}
        {!isMissing && unit != null && (
          <>
            {" "}
            <MonoText>{unit}</MonoText>
          </>
        )}
      </span>
    </div>
  );
});

export function CursorTimestampRow() {
  const cursorMs = useAtomValue(hoveredMsAtom);
  const referenceNs = useAtomValue(referenceNsAtom);

  const time =
    cursorMs == null || referenceNs == null
      ? undefined
      : DateTime.fromMillis(
          Number(calcAbsoluteNs(referenceNs, cursorMs) / BigInt(nsPerMs)),
        ).toFormat("h:mm:ss.SSS");

  return <TooltipRow label="Time" value={time} />;
}
