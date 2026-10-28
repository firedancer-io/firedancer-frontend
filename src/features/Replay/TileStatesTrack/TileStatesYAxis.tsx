import styles from "../chart.module.css";

const FIRST_LABEL_OFFSET_PX = 5;

interface TileStatesYAxisProps {
  labels: string[];
}

export default function TileStatesYAxis({ labels }: TileStatesYAxisProps) {
  if (labels.length === 0) return null;

  return (
    <div className={styles.yAxis}>
      {labels.map((label, row) => {
        const centerPct = ((row + 0.5) / labels.length) * 100;
        const top =
          row === 0
            ? `calc(${centerPct}% + ${FIRST_LABEL_OFFSET_PX}px)`
            : `${centerPct}%`;
        return (
          <div key={row} className={styles.yAxisTick} style={{ top }}>
            <span className={styles.yAxisTickLabel}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
