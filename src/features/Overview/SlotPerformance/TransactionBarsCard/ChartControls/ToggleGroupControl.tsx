import { ToggleGroup } from "radix-ui";
import { Flex, Text, Tooltip } from "@radix-ui/themes";
import styles from "./toggleGroupControl.module.css";
import chartControlStyles from "./chartControl.module.css";
import clsx from "clsx";

interface ToggleGroupControlProps<T extends string> {
  label?: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
  triggered?: boolean;
  onBlur?: (e: React.FocusEvent) => void;
  optionColors?: Partial<Record<T, string>>;
  hasMinTextWidth?: boolean;
}

export default function ToggleGroupControl<T extends string>({
  label,
  options,
  value,
  onChange,
  triggered,
  onBlur,
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
      <Tooltip
        className={chartControlStyles.chartControlTooltip}
        content={`Applied "${value}"`}
        open={!!triggered}
        side="bottom"
      >
        <ToggleGroup.Root
          id={`${label?.toLowerCase()}-toggle-group`}
          className={clsx(styles.group, triggered && styles.triggered)}
          type="single"
          value={value}
          aria-label={label}
          onValueChange={onChange}
          onBlur={onBlur}
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
      </Tooltip>
    </Flex>
  );
}
