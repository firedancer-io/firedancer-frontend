import styles from "../chart.module.css";
import { getRowTopPx, rowHeightPx, type CpuRow } from "./const.ts";

interface CpuYAxisProps {
  rows: CpuRow[];
}

export default function CpuYAxis({ rows }: CpuYAxisProps) {
  return (
    <div className={styles.yAxis}>
      {rows.map(({ key, label }, i) => (
        <div
          key={key}
          className={styles.yAxisTick}
          style={{ top: getRowTopPx(i) + rowHeightPx / 2 }}
        >
          <span className={styles.yAxisTickLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}
