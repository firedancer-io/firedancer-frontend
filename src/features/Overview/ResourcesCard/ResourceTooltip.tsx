import type { ComponentProps, ReactNode } from "react";
import { Flex, Separator, Text, Tooltip } from "@radix-ui/themes";
import clsx from "clsx";
import { useAtomValue } from "jotai";
import { containerElAtom } from "../../../atoms";
import MonoText from "../../../components/MonoText";
import styles from "./resourceTooltip.module.css";

export default function ResourceTooltip({
  className,
  ...props
}: ComponentProps<typeof Tooltip>) {
  const containerEl = useAtomValue(containerElAtom);
  return (
    <Tooltip
      container={containerEl}
      {...props}
      className={clsx(styles.resourceTooltip, className)}
    />
  );
}

interface TooltipBodyProps {
  scrollable?: boolean;
  children: ReactNode;
}

export function TooltipBody({ scrollable, children }: TooltipBodyProps) {
  return (
    <Flex
      direction="column"
      minWidth="170px"
      gap="2px"
      className={clsx(styles.keyValueTooltip, {
        [styles.scrollableTooltip]: scrollable,
      })}
    >
      {children}
    </Flex>
  );
}

interface TooltipRowProps {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
}

export function TooltipRow({ label, value, icon }: TooltipRowProps) {
  return (
    <Flex justify="between" gap="16px" align="center">
      <Flex align="center" gap="4px">
        {icon}
        <Text className={styles.tooltipLabel}>{label}</Text>
      </Flex>
      <MonoText className={styles.tooltipValue}>{value}</MonoText>
    </Flex>
  );
}

export function TooltipSeparator() {
  return <Separator size="4" my="4px" className={styles.tooltipSeparator} />;
}
