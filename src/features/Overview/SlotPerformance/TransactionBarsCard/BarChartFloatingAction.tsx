import { Button, Text } from "@radix-ui/themes";
import { EnterFullScreenIcon, ExitFullScreenIcon } from "@radix-ui/react-icons";
import styles from "./barChartFloatingAction.module.css";
import { setBarCount } from "./txnBarsPlugin";

interface BarChartFloatingActionProps {
  isSelected: boolean;
  setSelected: () => void;
  bankIdx: number;
}

export default function BarChartFloatingAction({
  setSelected,
  bankIdx,
  isSelected,
}: BarChartFloatingActionProps) {
  return (
    <div className={styles.container}>
      <Text className={styles.label}>Bank {bankIdx}</Text>
      <Button
        variant="ghost"
        size="1"
        onClick={() => {
          setBarCount(2);
          setSelected();
        }}
      >
        {!isSelected ? (
          <EnterFullScreenIcon color="grey" />
        ) : (
          <ExitFullScreenIcon color="grey" />
        )}
      </Button>
    </div>
  );
}
