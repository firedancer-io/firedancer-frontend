import { revenueScaleOptions, type RevenueScale } from "./consts.ts";
import type { AggGranularity } from "../../../api/types.ts";
import styles from "./revenueControls.module.css";

interface RevenueControlsProps {
  isAgg: boolean;
  granularity: AggGranularity | undefined;
  splitByRow: boolean;
  setSplitByRow: (value: boolean) => void;
  scale: RevenueScale;
  setScale: (value: RevenueScale) => void;
}

export default function RevenueControls({
  isAgg,
  granularity,
  splitByRow,
  setSplitByRow,
  scale,
  setScale,
}: RevenueControlsProps) {
  return (
    <div className={styles.controls}>
      <span>Bucket size: {isAgg ? (granularity ?? "-") : "Txn"}</span>
      <label className={styles.control}>
        Scale
        <select
          className={styles.select}
          value={scale}
          onChange={(e) => setScale(e.target.value as RevenueScale)}
        >
          {revenueScaleOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {!isAgg && (
        <label className={styles.control}>
          <input
            className={styles.checkbox}
            type="checkbox"
            checked={splitByRow}
            onChange={(e) => setSplitByRow(e.target.checked)}
          />
          Split by tile
        </label>
      )}
    </div>
  );
}
