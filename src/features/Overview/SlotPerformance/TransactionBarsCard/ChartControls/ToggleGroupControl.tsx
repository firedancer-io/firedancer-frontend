import { ToggleGroup } from "radix-ui";
import { Flex, Text, Tooltip } from "@radix-ui/themes";
import styles from "./toggleGroupControl.module.css";
import chartControlStyles from "./chartControl.module.css";
import clsx from "clsx";

interface ToggleGroupControlProps<T extends string> {
  label?: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  registerOptionRef?: (value: T, element: HTMLButtonElement | null) => void;
  isTooltipOpen?: boolean;
  closeTooltip?: (e: React.FocusEvent) => void;
  optionColors?: Partial<Record<T, string>>;
  hasMinTextWidth?: boolean;
}

export default function ToggleGroupControl<T extends string>({
  label,
  options,
  value,
  onChange,
  registerOptionRef,
  isTooltipOpen,
  closeTooltip,
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
        open={!!isTooltipOpen}
        side="bottom"
      >
        <ToggleGroup.Root
          className={clsx(styles.group, isTooltipOpen && styles.tooltipOpen)}
          type="single"
          value={value}
          aria-label={label}
          onValueChange={onChange}
        >
          {options.map((option) => (
            <ToggleGroup.Item
              key={option}
              ref={(el) => registerOptionRef?.(option, el)}
              className={styles.item}
              value={option}
              aria-label={option}
              onBlur={closeTooltip}
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
