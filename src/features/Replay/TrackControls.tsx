import type { ReactNode } from "react";
import clsx from "clsx";
import { Flex, Text } from "@radix-ui/themes";
import { CaretDownIcon } from "@radix-ui/react-icons";
import { RadioGroup } from "radix-ui";
import PopoverDropdown from "../../components/PopoverDropdown.tsx";
import chartStyles from "./chart.module.css";
import styles from "./trackControls.module.css";

export interface LegendItem<T extends string = string> {
  label: string;
  color: string;
  value?: T;
  description?: string;
}

interface TrackControlsProps<T extends string> {
  name: string;
  bucketSize: string | undefined;
  legend?: LegendItem<T>[];
  legendSelection?: { value: T; onChange: (value: T) => void };
  children?: ReactNode;
}

export default function TrackControls<T extends string>({
  name,
  bucketSize,
  legend,
  legendSelection,
  children,
}: TrackControlsProps<T>) {
  const label = (
    <>
      <Text className={styles.name}>{name}</Text>
      {bucketSize && <Text>per {bucketSize}</Text>}
    </>
  );

  if (!legend && !children) {
    return (
      <div className={clsx(chartStyles.noChartExplore, styles.controls)}>
        {label}
      </div>
    );
  }

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
          {legend && <Legend items={legend} selection={legendSelection} />}
          {legend && children && <TrackControlsDivider />}
          {children}
        </Flex>
      }
    >
      <button
        type="button"
        className={clsx(
          chartStyles.noChartExplore,
          styles.controls,
          styles.trigger,
        )}
      >
        {label}
        <CaretDownIcon className={styles.caret} />
      </button>
    </PopoverDropdown>
  );
}

interface LegendProps<T extends string> {
  items: LegendItem<T>[];
  selection: TrackControlsProps<T>["legendSelection"];
}

function Legend<T extends string>({ items, selection }: LegendProps<T>) {
  if (selection) {
    return (
      <RadioGroup.Root
        value={selection.value}
        onValueChange={(value) => selection.onChange(value as T)}
        aria-label="Series"
        asChild
      >
        <Flex direction="column">
          <Text className={styles.sectionHeader}>Series</Text>
          {items.map(({ value, ...item }) => (
            <RadioGroup.Item
              key={item.label}
              value={value ?? item.label}
              className={clsx(styles.option, styles.legendItem)}
            >
              <LegendItemContent {...item} />
            </RadioGroup.Item>
          ))}
        </Flex>
      </RadioGroup.Root>
    );
  }

  // For non-interactive legends, show all series as selected
  return (
    <Flex direction="column">
      <Text className={styles.sectionHeader}>Series</Text>
      {items.map(({ value: _, ...item }) => (
        <div
          key={item.label}
          className={clsx(styles.option, styles.legendItem, styles.static)}
        >
          <LegendItemContent {...item} />
        </div>
      ))}
    </Flex>
  );
}

function LegendItemContent({
  label,
  color,
  description,
}: Omit<LegendItem, "value">) {
  return (
    <>
      <div className={styles.swatch} style={{ background: color }} />
      {label}
      {description && (
        <span className={styles.legendDescription}>{description}</span>
      )}
    </>
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
      <Flex direction="column" width="100%">
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
