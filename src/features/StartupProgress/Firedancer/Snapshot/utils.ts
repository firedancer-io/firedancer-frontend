import { formatSIBytes } from "../../../../utils";

export function getProgress(
  completed: number | null | undefined,
  total: number | null | undefined,
) {
  const isComplete = completed != null && total != null && total === completed;

  return {
    isComplete,
    progressPct:
      completed == null || !total ? undefined : (completed / total) * 100,
  };
}

/** Cumulative average rate, available from the first frame; seeds the
    throughput emas so the bars never mount empty */
export function getSeedRate(
  cumulative: number | null | undefined,
  elapsedSeconds: number | null | undefined,
) {
  return cumulative && elapsedSeconds ? cumulative / elapsedSeconds : undefined;
}

export function getThroughputCompleteCorrected(
  isComplete: boolean,
  emaThroughput: number | null | undefined,
) {
  return isComplete ? 0 : emaThroughput;
}
export function formatByteValue(value: number | null | undefined) {
  return value == null ? undefined : formatSIBytes(value);
}
