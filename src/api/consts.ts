export const estimatedTpsDebounceMs = 400;
export const liveMetricsDebounceMs = 100;
export const liveTileMetricsDebounceMs = 130;
export const liveNetworkMetricsDebounceMs = 100;
export const waterfallDebounceMs = 100;
export const tileTimerDebounceMs = 25;
export const gossipNetworkDebounceMs = 300;
export const gossipPeerSizeDebounceMs = 1_000;

const VITE_WEBSOCKET_URL = import.meta.env.PROD
  ? null
  : (import.meta.env.VITE_WEBSOCKET_URL as string)?.trim();

export const websocketUrl = VITE_WEBSOCKET_URL
  ? VITE_WEBSOCKET_URL
  : `${window.location.protocol.startsWith("https") ? "wss" : "ws"}://${window.location.hostname}:${window.location.port}/websocket`;

export const websocketCompress =
  (import.meta.env.VITE_WEBSOCKET_COMPRESS as string)?.trim() !== "false";
