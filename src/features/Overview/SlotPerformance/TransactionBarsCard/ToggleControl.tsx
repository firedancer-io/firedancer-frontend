import { Flex, Switch, Text } from "@radix-ui/themes";
import styles from "./toggleControl.module.css";

interface ToggleControlProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  color?: string;
}

export default function ToggleControl({
  checked,
  onCheckedChange,
  label,
  color,
}: ToggleControlProps) {
  return (
    <Flex align="center" gap="2">
      <Text as="label" className={styles.label} style={{ color }}>
        <Flex gap="2">
          <Switch
            checked={checked}
            onCheckedChange={onCheckedChange}
            size="1"
          />
          {label}
        </Flex>
      </Text>
    </Flex>
  );
}
