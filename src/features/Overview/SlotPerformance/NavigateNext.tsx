import { Button, Text } from "@radix-ui/themes";
import chevronRight from "../../../assets/chevron_right_18dp_F7F7F7_FILL1_wght400_GRAD0_opsz20.svg";
import styles from "./navigate.module.css";

interface NavigateNextProps {
  nav: (count: number) => void;
  disabled?: boolean;
}

export default function NavigateNext({ nav, disabled }: NavigateNextProps) {
  return (
    <>
      <Button
        className={styles.navBtn}
        onClick={() => nav(1)}
        disabled={disabled}
      >
        <Text style={{ marginLeft: "8px" }}>1</Text>
        <img src={chevronRight} alt="+1 leader slot" />
      </Button>
      <Button
        className={styles.navBtn}
        onClick={() => nav(10)}
        disabled={disabled}
      >
        <Text style={{ marginLeft: "8px" }}>10</Text>
        <img src={chevronRight} alt="+10 leader slots" />
      </Button>
    </>
  );
}
