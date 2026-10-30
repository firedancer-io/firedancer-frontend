import styles from "../chart.module.css";

export interface YAxisTick {
  label: string;
  topPx: number;
}

interface TileStatesYAxisProps {
  ticks: YAxisTick[];
}

export default function TileStatesYAxis({ ticks }: TileStatesYAxisProps) {
  if (ticks.length === 0) return null;

  return (
    <div className={styles.yAxis}>
      {ticks.map(({ label, topPx }) => (
        <div
          key={`${label}:${topPx}`}
          className={styles.yAxisTick}
          style={{ top: `${topPx}px` }}
        >
          <span className={styles.yAxisTickLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}
