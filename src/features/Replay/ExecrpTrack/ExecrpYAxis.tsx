import styles from "../chart.module.css";

interface ExecrpYAxisProps {
  numRows: number;
}

/** One label per execrp row, centered vertically, matching the revenue track's row labels. */
export default function ExecrpYAxis({ numRows }: ExecrpYAxisProps) {
  if (numRows <= 0) return null;

  return (
    <div className={styles.yAxis}>
      {Array.from({ length: numRows }, (_, row) => {
        const centerPct = ((row + 0.5) / numRows) * 100;
        return (
          <div
            key={row}
            className={styles.yAxisTick}
            style={{ top: `${centerPct}%` }}
          >
            <span className={styles.yAxisTickLabel}>{`execrp ${row}`}</span>
          </div>
        );
      })}
    </div>
  );
}
