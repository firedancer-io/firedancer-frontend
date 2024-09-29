import { Box, Flex, Spinner, Text } from "@radix-ui/themes";
import { CSSProperties } from "react";
import styles from "./inprogressStep.module.css";
import { ReactNode } from "@tanstack/react-router";

interface InprogressStepProps {
  label: string;
  hide?: boolean;
  rightChildren?: ReactNode;
  bottomChildren?: ReactNode;
}
export default function InprogressStep({
  label,
  hide,
  rightChildren,
  bottomChildren,
}: InprogressStepProps) {
  const style: CSSProperties = hide ? { visibility: "hidden" } : {};

  return (
    <div className={styles.container} style={style}>
      <Flex justify="center" align="center">
        <Spinner />
      </Flex>
      <Flex gap="2" align="center">
        <Text className={styles.text}>{label}...</Text>
        <Box flexGrow="1" />
        {rightChildren}
      </Flex>
      {bottomChildren && (
        <>
          <div />
          {bottomChildren}
        </>
      )}
    </div>
  );
}
