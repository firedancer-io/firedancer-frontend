import { useAtomValue } from "jotai";
import { clusterAtom } from "../../api/atoms";
import styles from "./clusterIndicator.module.css";
import { getClusterColor } from "./util";

export default function CluserIndicator() {
  const cluster = useAtomValue(clusterAtom);
  const color = getClusterColor(cluster);

  return <div className={styles.indicator} style={{ background: color }} />;
}
