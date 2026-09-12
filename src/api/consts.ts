export const tpsSampleIntervalMs = 200;
export const liveMetricsDebounceMs = 100;
export const liveTileMetricsDebounceMs = 25;
export const liveNetworkMetricsDebounceMs = 100;
export const waterfallDebounceMs = 100;
export const tileTimerDebounceMs = 25;
export const gossipNetworkDebounceMs = 300;
export const gossipPeerSizeDebounceMs = 1_000;

const VITE_WEBSOCKET_URL =
  // "http://tsams2-ossdev-firedancer37.jumpisolated.com/websocket";
  // "http://tsams3-solana-mainnet-val107.jumpisolated.com/websocket";
  "http://gusc1a-ossdev-firedancer62.jumpisolated.com/websocket";
// "http://sun-ossdev-firedancer31.jumpisolated.com/websocket";
// "http://tsewr2-solana-mainnet-val111.jumpisolated.com/websocket";

export const websocketUrl = VITE_WEBSOCKET_URL
  ? VITE_WEBSOCKET_URL
  : `${window.location.protocol.startsWith("https") ? "wss" : "ws"}://${window.location.hostname}:${window.location.port}/websocket`;

export const websocketCompress =
  (import.meta.env.VITE_WEBSOCKET_COMPRESS as string)?.trim() !== "false";
