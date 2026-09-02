export const gossipHealthPublishIntervalMs = 100;
export const gossipHealthRenderWindowMs = 30_000;
export const gossipHealthHistoryBufferMs = 5_000;

export const overviewPublishIntervalMs = 500;
export const overviewRenderWindowMs = 60_000;
export const overviewHistoryBufferMs = 5_000;

// Spacing of the server-provided tps_history samples
export const tpsHistoryIntervalMs = 200;
export const tpsPublishIntervalMs = tpsHistoryIntervalMs;
// Keep in sync with the hardcoded "~ 1min ago" label in TransactionsCard/index.tsx
export const tpsRenderWindowMs = 60_000;
