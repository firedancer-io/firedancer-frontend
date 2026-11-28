export type NetworkMetricsCardType = "Ingress" | "Egress";

export const networkProtocols = [
  "turbine",
  "gossip",
  "tpu",
  "repair",
  "rserve",
  "metrics",
  "votor",
  "snapsv",
] as const;
