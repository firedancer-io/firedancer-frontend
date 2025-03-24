import { DateTime } from "luxon";

function log(level: "debug" | "error" | "warn" | "info") {
  return (category: string, ...message: unknown[]) => {
    console[level](
      `(${DateTime.now().toISO({ includeOffset: false }) ?? ""}) [${category}]`,
      ...message,
    );
  };
}

export const logDebug = log("debug");
export const logInfo = log("info");
export const logWarning = log("warn");
export const logError = log("error");

export const logCatchError = (category: string, error: unknown) => {
  if (error instanceof Error) logError(category, error.message);
  logError(category, String(error));
};
