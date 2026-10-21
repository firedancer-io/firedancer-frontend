import type { ReactNode } from "react";
import clsx from "clsx";
import { Flex, Text } from "@radix-ui/themes";
import { CaretDownIcon } from "@radix-ui/react-icons";
import { RadioGroup } from "radix-ui";
import PopoverDropdown from "../../components/PopoverDropdown.tsx";
import chartStyles from "./chart.module.css";
import styles from "./trackControls.module.css";

export interface LegendItem {
  label: string;
  color: string;
}

interface TrackControlsProps {
  name: string;
  bucketSize: string | undefined;
  legend?: LegendItem[];
  children?: ReactNode;
}

export default function TrackControls({
  name,
  bucketSize,
  legend,
  children,
}: TrackControlsProps) {
  return (
    <PopoverDropdown
      align="start"
      className={styles.dropdown}
      content={
        <Flex
          direction="column"
          width="100%"
          className={styles.dropdownContent}
        >
          {legend && <Legend items={legend} />}
          {legend && children && <TrackControlsDivider />}
          {children}
        </Flex>
      }
    >
      <button
        type="button"
        className={clsx(chartStyles.noChartExplore, styles.controls)}
      >
        <Text className={styles.name}>{name}</Text>
        {bucketSize && <Text>per {bucketSize}</Text>}
        <CaretDownIcon className={styles.caret} />
      </button>
    </PopoverDropdown>
  );
}

function Legend({ items }: { items: LegendItem[] }) {
  return (
    <Flex direction="column" gap="1">
      <Text className={styles.sectionHeader}>Series</Text>
      {items.map(({ label, color }) => (
        <Flex
          key={label}
          align="center"
          gap="6px"
          className={styles.legendItem}
        >
          <div className={styles.swatch} style={{ background: color }} />
          <Text className={styles.legendLabel}>{label}</Text>
        </Flex>
      ))}
    </Flex>
  );
}

export function TrackControlsDivider() {
  return <div className={styles.divider} />;
}

interface TrackControlsOptionsProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function TrackControlsOptions<T extends string>({
  label,
  options,
  value,
  onChange,
}: TrackControlsOptionsProps<T>) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(value) => onChange(value as T)}
      aria-label={label}
      asChild
    >
      <Flex direction="column" gap="1" width="100%">
        <Text className={styles.sectionHeader}>{label}</Text>
        {options.map((option) => (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            className={styles.option}
          >
            {option.label}
          </RadioGroup.Item>
        ))}
      </Flex>
    </RadioGroup.Root>
  );
}

interface TrackControlsToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function TrackControlsToggle({
  label,
  checked,
  onChange,
}: TrackControlsToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={clsx(styles.option, styles.toggle)}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className={styles.toggleValue}>{checked ? "on" : "off"}</span>
    </button>
  );
}
