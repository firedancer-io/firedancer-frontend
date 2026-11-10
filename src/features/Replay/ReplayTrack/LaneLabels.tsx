import clsx from "clsx";
import styles from "../chart.module.css";
import {
  isUnderTitle,
  ROW_LABEL_PX,
  TRACK_TITLE_PX,
  type RowsLayout,
} from "../layout.ts";
import { BAR_HEIGHT_RATIO } from "../tileStates/consts.ts";

interface LaneLabelsProps {
  rowCount: number;
  /** Labels each row's lanes, top-down */
  laneLabels: string[];
  layout: RowsLayout;
  laneGapPx: number;
}

/** A label per lane in each row, matching the composite shader */
export default function LaneLabels({
  rowCount,
  laneLabels,
  layout: { topPx, rowPx, gapPx },
  laneGapPx,
}: LaneLabelsProps) {
  if (rowCount === 0 || laneLabels.length === 0) return null;

  // bars sit at the bottom of their rows
  const barTopPx = rowPx * (1 - BAR_HEIGHT_RATIO);
  const lanePx = (rowPx * BAR_HEIGHT_RATIO) / laneLabels.length;

  // lanes too thin for their labels list them top-down beside the title
  if (lanePx < ROW_LABEL_PX) {
    return (
      <div className={styles.yAxis}>
        <div
          className={clsx(
            styles.yAxisTick,
            styles.besideTitle,
            styles.yAxisTickLabels,
          )}
          style={{ top: TRACK_TITLE_PX / 2 }}
        >
          {laneLabels.map((laneLabel) => (
            <span key={laneLabel} className={styles.yAxisTickLabel}>
              {laneLabel}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.yAxis}>
      {Array.from({ length: rowCount }, (_, row) => row).flatMap((row) =>
        laneLabels.map((laneLabel, lane) => {
          // every lane but the first has its gap at the top
          const centerPx =
            topPx +
            row * (rowPx + gapPx) +
            barTopPx +
            (lane + 0.5) * lanePx +
            (lane > 0 ? laneGapPx / 2 : 0);
          return (
            <div
              key={`${row}:${lane}`}
              className={clsx(styles.yAxisTick, {
                [styles.besideTitle]: isUnderTitle(centerPx),
              })}
              style={{ top: centerPx }}
            >
              <span className={styles.yAxisTickLabel}>{laneLabel}</span>
            </div>
          );
        }),
      )}
    </div>
  );
}
