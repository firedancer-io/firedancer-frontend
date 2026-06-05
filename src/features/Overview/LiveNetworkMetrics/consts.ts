export type NetworkMetricsCardType = "Ingress" | "Egress";

export const networkProtocols = [
  "turbine",
  "gossip",
  "tpu",
  "repair",
  "metrics",
] as const;
