import clsx from "clsx";
import styles from "./chart.module.css";
import { isUnderTitle, type RowsLayout } from "./layout.ts";

interface RowLabelsProps {
  labels: string[];
  layout: RowsLayout;
}

export default function RowLabels({
  labels,
  layout: { topPx, rowPx, gapPx, labelStep },
}: RowLabelsProps) {
  if (labels.length === 0) return null;

  return (
    <div className={styles.yAxis}>
      {labels.map((label, row) => {
        if (row % labelStep !== 0) return null;
        const centerPx = topPx + row * (rowPx + gapPx) + rowPx / 2;
        return (
          <div
            key={row}
            className={clsx(styles.yAxisTick, {
              [styles.besideTitle]: isUnderTitle(centerPx),
            })}
            style={{ top: centerPx }}
          >
            <span className={styles.yAxisTickLabel}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
