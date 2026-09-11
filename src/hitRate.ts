import {
  averageHitRateColor,
  badHitRateColor,
  goodHitRateColor,
  unknownHitRateColor,
} from "./colors";
import tableStyles from "./components/dataTable.module.css";

export type HitRateStatus = "Good" | "Average" | "Bad" | "Unknown";

export function getHitRateStatus(
  rate: number | null | undefined,
): HitRateStatus {
  if (rate == null) return "Unknown";
  if (rate < 0.99) return "Bad";
  if (rate < 0.995) return "Average";
  return "Good";
}

export function hitRateColor(status: HitRateStatus) {
  if (status === "Good") return goodHitRateColor;
  if (status === "Average") return averageHitRateColor;
  if (status === "Bad") return badHitRateColor;
  return unknownHitRateColor;
}

export function hitRateClass(rate: number | null | undefined) {
  const status = getHitRateStatus(rate);
  if (status === "Good") return tableStyles.green;
  if (status === "Average") return tableStyles.orange;
  if (status === "Bad") return tableStyles.red;
  return undefined;
}
