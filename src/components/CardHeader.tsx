import { Text } from "@radix-ui/themes";
import styles from "./cardHeader.module.css";
import clsx from "clsx";

interface CardHeaderProps {
  className?: string;
  text: string;
}

export default function CardHeader({ className, text }: CardHeaderProps) {
  return <Text className={clsx(styles.text, className)}>{text}</Text>;
}
