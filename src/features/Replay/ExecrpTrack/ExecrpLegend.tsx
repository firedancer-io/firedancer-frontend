import { Flex, Text } from "@radix-ui/themes";
import {
  stateColors,
  TxnState,
} from "../../Overview/SlotPerformance/TransactionBarsCard/consts.ts";
import type { RgbColor } from "../../WebGl/webglUtils.ts";
import { SIGVERIFY_RGB } from "./consts.ts";
import styles from "./execrpControls.module.css";

const cssRgb = ([r, g, b]: RgbColor) =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

const LEGEND_ITEMS: { label: string; color: string }[] = [
  { label: TxnState.LOADING, color: stateColors[TxnState.LOADING] },
  { label: TxnState.VALIDATE, color: stateColors[TxnState.VALIDATE] },
  { label: TxnState.EXECUTE, color: stateColors[TxnState.EXECUTE] },
  { label: TxnState.POST_EXECUTE, color: stateColors[TxnState.POST_EXECUTE] },
  { label: "Sigverify", color: cssRgb(SIGVERIFY_RGB) },
];

export default function ExecrpLegend() {
  return (
    <Flex className={styles.controls} align="center" gap="3">
      {LEGEND_ITEMS.map(({ label, color }) => (
        <Flex key={label} align="center" gap="1">
          <span
            className={styles.legendSwatch}
            style={{ backgroundColor: color }}
          />
          <Text>{label}</Text>
        </Flex>
      ))}
    </Flex>
  );
}
