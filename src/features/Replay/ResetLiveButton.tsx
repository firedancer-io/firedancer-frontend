import { Button, Text } from "@radix-ui/themes";
import { memo } from "react";
import SkipNextIcon from "@material-design-icons/svg/filled/skip_next.svg?react";
import styles from "./resetLiveButton.module.css";

interface ResetLiveButtonProps {
  onClick: () => void;
}
export default memo(function ResetLiveButton({
  onClick,
}: ResetLiveButtonProps) {
  return (
    <div className={styles.resetLiveContainer}>
      <Button className={styles.resetLiveButton} onClick={onClick}>
        <Text>Skip to RT</Text>
        <SkipNextIcon className={styles.resetLiveIcon} />
      </Button>
    </div>
  );
});
