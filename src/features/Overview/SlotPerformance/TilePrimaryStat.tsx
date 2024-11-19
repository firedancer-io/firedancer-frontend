import styles from "./tilePrimaryStat.module.css";
import { useAtomValue } from "jotai";
import { liveTilePrimaryMetricAtom } from "../../../api/atoms";
import { Text } from "@radix-ui/themes";
import { TilePrimaryMetric } from "../../../api/types";
import { selectedSlotAtom } from "./atoms";
import useSlotQuery from "../../../hooks/useSlotQuery";
import byteSize from "byte-size";

interface TilePrimaryStatProps {
  type: keyof TilePrimaryMetric;
  label: string;
}

export default function TilePrimaryStat({ type, label }: TilePrimaryStatProps) {
  const slot = useAtomValue(selectedSlotAtom);
  const showLive = !slot;
  const primaryMetric = useAtomValue(liveTilePrimaryMetricAtom);
  const query = useSlotQuery(showLive ? undefined : slot);

  const stat = showLive
    ? primaryMetric?.tile_primary_metric?.[type]
    : query.slotResponse?.tile_primary_metric?.[type];

  const style =
    type === "net_in" || type === "net_out" ? { minWidth: "55px" } : undefined;

  return (
    <div className={styles.statContainer}>
      <Text className={styles.label}>{label}</Text>
      <div className={styles.valueContainer} style={style}>
        <Text className={styles.value}>{getFormatted(type, stat)}</Text>
      </div>
    </div>
  );
}

function getFormatted(type: keyof TilePrimaryMetric, value?: number) {
  if (value === undefined || value === -1) return "-";

  if (type === "net_in" || type === "net_out") {
    const bytes = value * 8;
    const bsRes = byteSize(value * 8, {
      precision: bytes > 1_000_000_000 ? 2 : 0,
    });
    const bits = Number(bsRes.value);
    if (!value) return "0";

    const unit = bsRes.unit.replace("B", "b");
    return `${bits} ${unit}/s`;
  }

  if (type === "verify" || type === "dedup" || type === "pack") {
    if (value < 0.01 && value > 0) {
      const pct = value * 100;
      return `${pct.toFixed(2)}%`;
    } else {
      const pct = value * 100;
      return `${Math.trunc(pct)}%`;
    }
  }

  return value.toLocaleString();
}
