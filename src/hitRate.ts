import {
  averageChangedColor,
  averageUnchangedColor,
  badChangedColor,
  badUnchangedColor,
  goodChangedColor,
  goodUnchangedColor,
  unknownChangedColor,
  unknownUnchangedColor,
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

export function hitRateChangedColor(status: HitRateStatus) {
  if (status === "Good") return goodChangedColor;
  if (status === "Average") return averageChangedColor;
  if (status === "Bad") return badChangedColor;
  return unknownChangedColor;
}

export function hitRateUnchangedColor(status: HitRateStatus) {
  if (status === "Good") return goodUnchangedColor;
  if (status === "Average") return averageUnchangedColor;
  if (status === "Bad") return badUnchangedColor;
  return unknownUnchangedColor;
}

export function hitRateClass(rate: number | null | undefined) {
  const status = getHitRateStatus(rate);
  if (status === "Good") return tableStyles.green;
  if (status === "Average") return tableStyles.orange;
  if (status === "Bad") return tableStyles.red;
  return undefined;
}
