import { Cluster } from "../../api/types";

export function getClusterColor(cluster?: Cluster) {
  switch (cluster) {
    case "mainnet-beta":
      return "#1CE7C2";
    case "testnet":
      return "#E7B81C";
    case "development":
      return "#1C96E7";
    case "devnet":
      return "#E7601C";
    case "pythnet":
      return "#9D1CE7";
    case "pythtest":
      return "#E71C88";
    case "unknown":
    default:
      return "#898989";
  }
}
