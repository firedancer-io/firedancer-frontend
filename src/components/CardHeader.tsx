import { Text } from "@radix-ui/themes";
import styles from "./cardHeader.module.css"

interface CardHeaderProps {
  text: string;
}

export default function CardHeader({
  text,
}: CardHeaderProps) {
  return (
    <Text className={styles.text}>
      {text}
    </Text>
  );
}
