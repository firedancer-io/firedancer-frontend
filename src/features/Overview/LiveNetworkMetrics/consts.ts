export type NetworkMetricsCardType = "Ingress" | "Egress";

export const networkProtocols = [
  "turbine",
  "gossip",
  "tpu",
  "repair",
  "metrics",
] as const;

type NetworkProtocol = (typeof networkProtocols)[number];
export type NetworkMetricsTableRowLabel = "Total";

export const networkMaxByteValues: {
  [key in NetworkMetricsCardType]: {
    [key in NetworkProtocol | NetworkMetricsTableRowLabel]: number;
  };
} = {
  Ingress: {
    turbine: 64_000_000 / 8,
    gossip: 1_000_000_000 / 8,
    tpu: 100_000_000 / 8,
    repair: 1_000_000 / 8,
    metrics: 10_000 / 8,
    Total: 1_189_010_000 / 8,
  },
  Egress: {
    turbine: 1_000_000_000 / 8,
    gossip: 1_000_000_000 / 8,
    tpu: 1_000_000 / 8,
    repair: 1_000_000 / 8,
    metrics: 10_000 / 8,
    Total: 2_050_010_000 / 8,
  },
};
