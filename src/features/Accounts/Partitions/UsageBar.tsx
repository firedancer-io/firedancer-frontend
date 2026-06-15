import { useRef } from "react";
import styles from "./partitions.module.css";

interface UsageBarProps {
  usedFrac: number;
  fragmentedFrac: number;
  compactionTriggerFrac: number;
  isWriteHead: boolean;
  compactionFrac: number;
  compactionState: number;
}

export default function UsageBar({
  usedFrac,
  fragmentedFrac,
  compactionTriggerFrac,
  isWriteHead,
  compactionFrac,
  compactionState,
}: UsageBarProps) {
  const usedPct = Math.min(100, Math.max(0, usedFrac * 100));
  const fragPct = Math.min(100 - usedPct, Math.max(0, fragmentedFrac * 100));
  const headPct = Math.min(100, usedPct + fragPct);
  const unusedPct = Math.max(0, 100 - headPct);
  const triggerFracPct = Math.max(0, compactionTriggerFrac * 100);
  const triggerPct = Math.max(0, headPct - triggerFracPct);
  const showTrigger = triggerFracPct > 0 && triggerPct < headPct;

  const prevUsedRef = useRef(usedPct);
  const prevUsed = prevUsedRef.current;
  const deltaStart = Math.min(prevUsed, usedPct);
  const deltaWidth = Math.max(0, usedPct - prevUsed);
  prevUsedRef.current = usedPct;
  const fadeKey = `${deltaStart.toFixed(3)}-${deltaWidth.toFixed(3)}`;

  const prevFragRef = useRef(fragPct);
  const prevFrag = prevFragRef.current;
  const fragSolidWidth = Math.min(prevFrag, fragPct);
  const fragDeltaWidth = Math.max(0, fragPct - prevFrag);
  prevFragRef.current = fragPct;
  const fragFadeKey = `${usedPct.toFixed(3)}-${fragSolidWidth.toFixed(3)}-${fragDeltaWidth.toFixed(3)}`;

  const isCompacting = compactionState === 2;
  const compactionPct = Math.min(100, Math.max(0, compactionFrac * 100));

  return (
    <div className={styles.barWrap}>
      <div className={styles.bar}>
        <div
          className={styles.barFill}
          style={{ width: `${deltaStart.toFixed(2)}%` }}
        />
        {deltaWidth > 0 && (
          <div
            key={fadeKey}
            className={`${styles.barFill} ${styles.barFillFade}`}
            style={{
              left: `${deltaStart.toFixed(2)}%`,
              width: `${deltaWidth.toFixed(2)}%`,
            }}
          />
        )}
        {fragDeltaWidth > 0 && (
          <div
            key={fragFadeKey}
            className={`${styles.barFillFrag} ${styles.barFillFade}`}
            style={{
              left: `${usedPct.toFixed(2)}%`,
              width: `${fragDeltaWidth.toFixed(2)}%`,
            }}
          />
        )}
        <div
          className={styles.barFillFrag}
          style={{
            left: `${(usedPct + fragDeltaWidth).toFixed(2)}%`,
            width: `${fragSolidWidth.toFixed(2)}%`,
          }}
        />
        {isCompacting && (
          <div
            className={styles.barCompactedOverlay}
            style={{ width: `${compactionPct.toFixed(2)}%` }}
          />
        )}
        <div
          className={styles.barHit}
          style={{ left: "0", width: `${usedPct.toFixed(2)}%` }}
          title={`Used: ${usedPct.toFixed(1)}%`}
        />
        <div
          className={styles.barHit}
          style={{
            left: `${usedPct.toFixed(2)}%`,
            width: `${fragPct.toFixed(2)}%`,
          }}
          title={`Fragmented: ${fragPct.toFixed(1)}%`}
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
        {showTrigger && (
          <div
            className={styles.barTriggerHit}
            style={{ left: `${triggerPct.toFixed(2)}%` }}
            title={`Compaction trigger: fragmentation reaches ${triggerFracPct.toFixed(0)}% of partition`}
          >
            <div className={styles.barTrigger} />
          </div>
        )}
        {isWriteHead && (
          <div
            className={styles.barWriteHeadHit}
            style={{ left: `${headPct.toFixed(2)}%` }}
            title="Active write head"
          >
            <div className={styles.barWriteHead} />
          </div>
        )}
        {isCompacting && (
          <div
            className={styles.barCompactionHeadHit}
            style={{ left: `${compactionPct.toFixed(2)}%` }}
            title={`Compaction progress: ${compactionPct.toFixed(1)}%`}
          >
            <div className={styles.barCompactionHead} />
          </div>
        )}
      </div>
      <span className={styles.secondary}>{Math.round(headPct)}%</span>
    </div>
  );
}
