export type NetworkMetricsCardType = "Ingress" | "Egress";

export const networkProtocols = [
  "turbine",
  "gossip",
  "tpu",
  "repair",
  "rserve",
  "metrics",
] as const;
