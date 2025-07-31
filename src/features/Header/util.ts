import { Cluster } from "../../api/types";
import {
  clusterDevelopmentColor,
  clusterDevnetColor,
  clusterMainnetBetaColor,
  clusterPythnetColor,
  clusterPythtestColor,
  clusterTestnetColor,
  clusterUnknownColor,
} from "../../colors";

export function getClusterColor(cluster?: Cluster) {
  switch (cluster) {
    case "mainnet-beta":
      return clusterMainnetBetaColor;
    case "testnet":
      return clusterTestnetColor;
    case "development":
      return clusterDevelopmentColor;
    case "devnet":
      return clusterDevnetColor;
    case "pythnet":
      return clusterPythnetColor;
    case "pythtest":
      return clusterPythtestColor;
    case "unknown":
    case undefined:
      return clusterUnknownColor;
  }
}
