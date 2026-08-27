export type NetworkMetricsCardType = "Ingress" | "Egress";

/* Indices match the server's protocol array.  Alpenglow servers append
   votor; Tower servers send it as zero and older servers omit it
   entirely, so the rows are driven by the array the server sent rather
   than by this list's length. */
export const networkProtocols = [
  "turbine",
  "gossip",
  "tpu",
  "repair",
  "rserve",
  "metrics",
  "votor",
] as const;
