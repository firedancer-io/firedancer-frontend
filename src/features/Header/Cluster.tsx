import { useAtomValue } from "jotai";
import { clusterAtom, versionAtom } from "../../api/atoms";
import { Text, Tooltip } from "@radix-ui/themes";
import styles from "./cluster.module.css";
import connectedIcon from "../../assets/power.svg";
import reconnectingIcon from "../../assets/power_off_orange.svg";
import disconnectedIcon from "../../assets/power_off_red.svg";
import { socketStateAtom } from "../../api/ws/atoms";
import { SocketState } from "../../api/ws/types";
import { getClusterColor } from "./util";
import { useWindowSize } from "react-use";

export default function Cluster() {
  const cluster = useAtomValue(clusterAtom);
  const version = useAtomValue(versionAtom);
  const socketState = useAtomValue(socketStateAtom);
  const { width } = useWindowSize();
  const isSmallScreen = width < 600;

  if (!cluster && !version) return null;

  let icon = disconnectedIcon;
  if (socketState === SocketState.Connected) {
    icon = connectedIcon;
  } else if (socketState === SocketState.Connecting) {
    icon = reconnectingIcon;
  }

  let clusterText: string | undefined = cluster;
  if (cluster === "mainnet-beta") {
    clusterText = "mainnet";
  }

  return (
    <div className={styles.cluster}>
      <Tooltip content="Cluster the validator is joined to">
        <Text
          className={styles.clusterName}
          style={{ background: getClusterColor(cluster) }}
        >
          {clusterText}
        </Text>
      </Tooltip>
      {!isSmallScreen && (
        <Tooltip content="Current validator software version">
          <Text className={styles.version}>v{version}</Text>
        </Tooltip>
      )}
      <Tooltip
        content={`GUI is currently ${socketState} ${socketState === SocketState.Disconnected ? "from" : "to"} the validator`}
      >
        <img src={icon} alt="ws status" />
      </Tooltip>
    </div>
  );
}
