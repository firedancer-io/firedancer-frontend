import { forwardRef, useImperativeHandle, useRef } from "react";
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
  isTooltipOpen?: boolean;
  closeTooltip?: (e: React.FocusEvent) => void;
  optionColors?: Partial<Record<T, string>>;
  hasMinTextWidth?: boolean;
}

export interface ToggleGroupControlHandle<T extends string> {
  focus: (value: T) => void;
}

function ToggleGroupControlInner<T extends string>(
  {
    label,
    options,
    value,
    onChange,
    isTooltipOpen,
    closeTooltip,
    optionColors,
    hasMinTextWidth,
  }: ToggleGroupControlProps<T>,
  ref: React.Ref<ToggleGroupControlHandle<T>>,
) {
  const optionButtonRefs = useRef<Map<T, HTMLButtonElement>>(new Map());

  useImperativeHandle(ref, () => ({
    focus: (option: T) => {
      optionButtonRefs.current.get(option)?.focus();
    },
  }));

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
          onValueChange={(value) => value && onChange(value as T)}
        >
          {options.map((option) => (
            <ToggleGroup.Item
              key={option}
              ref={(el) => {
                if (el) {
                  optionButtonRefs.current.set(option, el);
                } else {
                  optionButtonRefs.current.delete(option);
                }
              }}
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

const ToggleGroupControl = forwardRef(ToggleGroupControlInner) as <
  T extends string,
>(
  props: ToggleGroupControlProps<T> & {
    ref?: React.Ref<ToggleGroupControlHandle<T>>;
  },
) => React.ReactElement;

export default ToggleGroupControl;
