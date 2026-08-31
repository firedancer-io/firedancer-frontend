export type NetworkMetricsCardType = "Ingress" | "Egress";

export const networkProtocols = [
  "turbine",
  "gossip",
  "tpu",
  "repair",
  "rserve",
  "metrics",
  "votor",
] as const;
