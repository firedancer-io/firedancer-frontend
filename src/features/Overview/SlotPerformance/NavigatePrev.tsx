import { Button, Text } from "@radix-ui/themes";
import chevronLeft from "../../../assets/chevron_left_18dp_F7F7F7_FILL1_wght400_GRAD0_opsz20.svg";
import styles from "./navigate.module.css";

interface NavigatePrevProps {
  nav: (count: number) => void;
  disabled?: boolean;
}

export default function NavigatePrev({ nav, disabled }: NavigatePrevProps) {

  return (
    <>
      <Button
        className={styles.navBtn}
        onClick={() => nav(10)}
        disabled={disabled}
      >
        <img src={chevronLeft} alt="-10 leader slots" />
        <Text style={{ marginRight: "8px" }}>10</Text>
      </Button>
      <Button
        className={styles.navBtn}
        onClick={() => nav(1)}
        disabled={disabled}
      >
        <img src={chevronLeft} alt="-1 leader slot" />
        <Text style={{ marginRight: "8px" }}>1</Text>
      </Button>
    </>
  );
}
