import { revenueScaleOptions, type RevenueScale } from "./consts.ts";
import type { AggGranularity } from "../../../api/types.ts";

interface RevenueControlsProps {
  isAgg: boolean;
  granularity: AggGranularity | undefined;
  renderMinWidth: boolean;
  setRenderMinWidth: (value: boolean) => void;
  splitByRow: boolean;
  setSplitByRow: (value: boolean) => void;
  scale: RevenueScale;
  setScale: (value: RevenueScale) => void;
}

export default function RevenueControls({
  isAgg,
  granularity,
  renderMinWidth,
  setRenderMinWidth,
  splitByRow,
  setSplitByRow,
  scale,
  setScale,
}: RevenueControlsProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: "5px",
        display: "flex",
        gap: "12px",
        alignItems: "center",
      }}
    >
      <span>Bucket size: {isAgg ? (granularity ?? "-") : "Txn"}</span>
      <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
        Scale
        <select
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
        <>
          <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={renderMinWidth}
              onChange={(e) => setRenderMinWidth(e.target.checked)}
            />
            Min width
          </label>
          <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={splitByRow}
              onChange={(e) => setSplitByRow(e.target.checked)}
            />
            Split by tile
          </label>
        </>
      )}
    </div>
  );
}
