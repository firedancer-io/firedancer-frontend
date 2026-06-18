import { useRef } from "react";
import { Tooltip } from "@radix-ui/themes";
import styles from "./partitions.module.css";

interface UsageBarProps {
  usedFrac: number;
  fragmentedFrac: number;
  compactionTriggerFrac: number;
  isWriteHead: boolean;
  compactionFrac: number;
  compactionState: number;
}

export default function UsageBarPoc({
  usedFrac,
  fragmentedFrac,
  compactionTriggerFrac,
  isWriteHead,
  compactionFrac,
  compactionState,
}: UsageBarProps) {
  // Fragmented comes first (left), used comes after
  const fragPct = Math.min(100, Math.max(0, fragmentedFrac * 100));
  const usedPct = Math.min(100 - fragPct, Math.max(0, usedFrac * 100));
  const headPct = Math.min(100, fragPct + usedPct);
  const unusedPct = Math.max(0, 100 - headPct);
  const triggerFracPct = Math.max(0, compactionTriggerFrac * 100);
  // Trigger is measured from the left (fragmentation side)
  const showTrigger = triggerFracPct > 0;

  const prevFragRef = useRef(fragPct);
  const prevFrag = prevFragRef.current;
  const fragSolidWidth = Math.min(prevFrag, fragPct);
  const fragDeltaWidth = Math.max(0, fragPct - prevFrag);
  prevFragRef.current = fragPct;
  const fragFadeKey = `${fragSolidWidth.toFixed(3)}-${fragDeltaWidth.toFixed(3)}`;

  const prevUsedRef = useRef(usedPct);
  const prevUsed = prevUsedRef.current;
  const deltaStart = Math.min(prevUsed, usedPct);
  const deltaWidth = Math.max(0, usedPct - prevUsed);
  prevUsedRef.current = usedPct;
  const fadeKey = `${fragPct.toFixed(3)}-${deltaStart.toFixed(3)}-${deltaWidth.toFixed(3)}`;

  const isCompacting = compactionState === 2;
  const compactionPct = Math.min(100, Math.max(0, compactionFrac * 100));

  const triggerMet =
    compactionTriggerFrac > 0 && fragmentedFrac >= compactionTriggerFrac;
  const tooltipColor = triggerMet ? "var(--yellow-9)" : undefined;
  const tooltipContent = (
    <span style={{ color: tooltipColor }}>
      {`Fragmentation: ${(fragmentedFrac * 100).toFixed(1)}% / ${compactionTriggerFrac > 0 ? `${(compactionTriggerFrac * 100).toFixed(1)}%` : "—"}`}
      {triggerMet ? " — trigger met" : ""}
    </span>
  );

  return (
    <Tooltip content={tooltipContent}>
      <div className={styles.barWrap}>
        <div
          className={styles.bar}
          style={{
            height: "10px",
            borderRadius: 0,
            overflow: "visible",
            background: "var(--gray-4)",
          }}
        >
          {/* Fragmented region (left) */}
          <div
            className={styles.barFillFrag}
            style={{
              left: "0",
              width: `${fragSolidWidth.toFixed(2)}%`,
              background: "#E5484D",
            }}
          />
          {fragDeltaWidth > 0 && (
            <div
              key={fragFadeKey}
              className={`${styles.barFillFrag} ${styles.barFillFade}`}
              style={{
                left: `${fragSolidWidth.toFixed(2)}%`,
                width: `${fragDeltaWidth.toFixed(2)}%`,
                background: "#E5484D",
              }}
            />
          )}

          {/* Used region (right of frag) */}
          <div
            className={styles.barFill}
            style={{
              left: `${fragPct.toFixed(2)}%`,
              width: `${deltaStart.toFixed(2)}%`,
              background: "rgb(54, 58, 99)",
            }}
          />
          {deltaWidth > 0 && (
            <div
              key={fadeKey}
              className={`${styles.barFill} ${styles.barFillFade}`}
              style={{
                left: `${(fragPct + deltaStart).toFixed(2)}%`,
                width: `${deltaWidth.toFixed(2)}%`,
                background: "rgb(54, 58, 99)",
              }}
            />
          )}

          {/* Compaction overlay sweeps from left */}
          {isCompacting && (
            <div
              className={styles.barCompactedOverlay}
              style={{ width: `${compactionPct.toFixed(2)}%` }}
            />
          )}

          {/* Hit targets for tooltips */}
          <div
            className={styles.barHit}
            style={{ left: "0", width: `${fragPct.toFixed(2)}%` }}
            title={`Fragmented: ${fragPct.toFixed(1)}%`}
          />
          <div
            className={styles.barHit}
            style={{
              left: `${fragPct.toFixed(2)}%`,
              width: `${usedPct.toFixed(2)}%`,
            }}
            title={`Used: ${usedPct.toFixed(1)}%`}
          />
          {isWriteHead && unusedPct > 0 && (
            <div
              className={styles.barHit}
              style={{
                left: `${headPct.toFixed(2)}%`,
                width: `${unusedPct.toFixed(2)}%`,
              }}
              title={`Unused: ${unusedPct.toFixed(1)}%`}
            />
          )}

          {/* Compaction trigger: measured from left */}
          {showTrigger && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: `${triggerFracPct.toFixed(2)}%`,
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "3px solid transparent",
                borderRight: "3px solid transparent",
                borderBottom: "4px solid var(--yellow-9)",
                cursor: "default",
              }}
              title={`Compaction trigger: fragmentation reaches ${triggerFracPct.toFixed(0)}% of partition`}
            />
          )}

          {isWriteHead && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: `${headPct.toFixed(2)}%`,
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "3px solid transparent",
                borderRight: "3px solid transparent",
                borderBottom: "4px solid #d9d9d9",
                cursor: "default",
              }}
              title="Active write head"
            />
          )}
          {isCompacting && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: `${compactionPct.toFixed(2)}%`,
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "3px solid transparent",
                borderRight: "3px solid transparent",
                borderBottom: "4px solid var(--yellow-9)",
                cursor: "default",
              }}
              title={`Compaction progress: ${compactionPct.toFixed(1)}%`}
            />
          )}
        </div>
        <span
          className={styles.secondary}
          style={{ color: headPct >= 100 ? "#E5484D" : "var(--green-9)" }}
        >
          {Math.round(headPct)}%
        </span>
      </div>
    </Tooltip>
  );
}
