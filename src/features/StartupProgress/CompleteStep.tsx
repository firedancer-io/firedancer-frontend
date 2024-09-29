import { Flex, Text } from "@radix-ui/themes";
import checkGreenIcon from "../../assets/check_green.svg";
import styles from "./completeStep.module.css";
import { CSSProperties } from "react";

interface CompleteStepProps {
  label: string;
  hide?: boolean;
}
export default function CompleteStep({ label, hide }: CompleteStepProps) {
  const style: CSSProperties = hide ? { visibility: "hidden" } : {};

  return (
    <Flex gap="2" align="center" style={style} className={styles.container}>
      <img src={checkGreenIcon} alt="complete" />
      <Text className={styles.text}>{label}</Text>
    </Flex>
  );
}
