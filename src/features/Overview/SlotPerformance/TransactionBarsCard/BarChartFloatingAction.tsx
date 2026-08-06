import { Button, Text } from "@radix-ui/themes";
import { EnterFullScreenIcon, ExitFullScreenIcon } from "@radix-ui/react-icons";
import styles from "./barChartFloatingAction.module.css";
import { barChartAxisSize } from "./consts";

interface BarChartFloatingActionProps {
  isSelected: boolean;
  setSelected: () => void;
  bankIdx: number;
  hasTopAxis?: boolean;
}

export default function BarChartFloatingAction({
  setSelected,
  bankIdx,
  isSelected,
  hasTopAxis,
}: BarChartFloatingActionProps) {
  return (
    <div
      className={styles.container}
      style={{ marginTop: hasTopAxis ? barChartAxisSize : undefined }}
    >
      <Text className={styles.label}>Bank {bankIdx}</Text>
      <Button variant="ghost" size="1" onClick={() => setSelected()}>
        {!isSelected ? (
          <EnterFullScreenIcon color="grey" />
        ) : (
          <ExitFullScreenIcon color="grey" />
        )}
      </Button>
    </div>
  );
}
