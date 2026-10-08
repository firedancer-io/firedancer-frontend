import { Text } from "@radix-ui/themes";
import clsx from "clsx";
import styles from "./cardHeader.module.css";

interface CardHeaderProps {
  text: string;
  /** Optional extra class, e.g. a per-card color override. */
  className?: string;
}

export default function CardHeader({ text, className }: CardHeaderProps) {
  return <Text className={clsx(styles.text, className)}>{text}</Text>;
}
