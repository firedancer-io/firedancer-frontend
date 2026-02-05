import { ToggleGroup } from "radix-ui";
import { Flex, Text } from "@radix-ui/themes";
import styles from "./toggleGroupControl.module.css";
import clsx from "clsx";

interface ToggleGroupControlProps<T extends string> {
  label?: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
  optionColors?: Partial<Record<T, string>>;
  hasMinTextWidth?: boolean;
}

export default function ToggleGroupControl<T extends string>({
  label,
  options,
  value,
  onChange,
  optionColors,
  hasMinTextWidth,
}: ToggleGroupControlProps<T>) {
  return (
    <Flex align="center">
      {label && (
        <Text
          className={clsx(styles.groupLabel, {
            [styles.minTextWidth]: hasMinTextWidth,
          })}
        >
          {label}
        </Text>
      )}
      <ToggleGroup.Root
        className={styles.group}
        type="single"
        value={value}
        aria-label={label}
        onValueChange={onChange}
      >
        {options.map((option) => (
          <ToggleGroup.Item
            key={option}
            className={styles.item}
            value={option}
            aria-label={option}
          >
            {optionColors?.[option] && (
              <div
                className={styles.itemColor}
                style={{ background: optionColors[option] }}
              />
            )}
            {option}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </Flex>
  );
}
