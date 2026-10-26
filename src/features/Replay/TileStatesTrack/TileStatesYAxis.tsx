import styles from "../chart.module.css";

interface TileStatesYAxisProps {
  labels: string[];
}

export default function TileStatesYAxis({ labels }: TileStatesYAxisProps) {
  if (labels.length === 0) return null;

  return (
    <div className={styles.yAxis}>
      {labels.map((label, row) => {
        const centerPct = ((row + 0.5) / labels.length) * 100;
        return (
          <div
            key={row}
            className={styles.yAxisTick}
            style={{ top: `${centerPct}%` }}
          >
            <span className={styles.yAxisTickLabel}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
