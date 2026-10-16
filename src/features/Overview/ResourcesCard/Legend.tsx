import { useState, type ReactNode } from "react";
import { Box, Flex, Text } from "@radix-ui/themes";
import clsx from "clsx";
import { formatSIBytesStr } from "../../../utils";
import { SubHeading } from "./Headings";
import ResourceTooltip from "./ResourceTooltip";
import type { ResourceSegment } from "./utils";
import styles from "./legend.module.css";

type Highlight = "active" | "dimmed";

function getHighlight(
  activeKey: string | null | undefined,
  key: string,
): Highlight | undefined {
  if (activeKey == null) return undefined;
  return activeKey === key ? "active" : "dimmed";
}

interface LegendSubHeadingProps {
  label: string;
  segments: ResourceSegment[];
  total: number;
  children?: ReactNode;
}

export function LegendSubHeading({
  label,
  segments,
  total,
  children,
}: LegendSubHeadingProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  return (
    <Flex direction="column" gap="3px" minWidth="0">
      <SubHeading label={label} value={formatSIBytesStr(total)}>
        {segments.map((segment) => (
          <LegendItem
            key={segment.key}
            label={segment.label}
            value={formatSIBytesStr(segment.bytes)}
            color={segment.color}
            itemKey={segment.key}
            activeKey={activeKey}
            onMouseEnter={() => setActiveKey(segment.key)}
            onMouseLeave={() => setActiveKey(null)}
          />
        ))}
      </SubHeading>
      <SegmentedBar
        segments={segments}
        total={total}
        activeKey={activeKey}
        onHover={(segment) => setActiveKey(segment?.key ?? null)}
      />
      {children}
    </Flex>
  );
}

interface SegmentedBarProps {
  segments: ResourceSegment[];
  total: number;
  height?: string;
  activeKey?: string | null;
  onHover?: (segment: ResourceSegment | null) => void;
}

export function SegmentedBar({
  segments,
  total,
  height = "10px",
  activeKey,
  onHover,
}: SegmentedBarProps) {
  return (
    <Flex
      className={styles.segmentedBar}
      width="100%"
      height={height}
      overflow="hidden"
    >
      {segments.map((segment) => {
        const width = total > 0 ? (segment.bytes / total) * 100 : 0;
        if (width <= 0) return null;

        const highlight = getHighlight(activeKey, segment.key);

        return (
          <Box
            key={segment.key}
            minWidth="1px"
            className={clsx({
              [styles.segmentActive]: highlight === "active",
              [styles.dimmed]: highlight === "dimmed",
            })}
            style={{
              background: segment.color,
              flexBasis: `${width}%`,
            }}
            onMouseEnter={onHover ? () => onHover(segment) : undefined}
            onMouseLeave={onHover ? () => onHover(null) : undefined}
          />
        );
      })}
    </Flex>
  );
}

interface LegendItemProps {
  label: string;
  value?: string | number;
  color?: string;
  gap?: string;
  tooltip?: ReactNode;
  icon?: ReactNode;
  itemKey?: string;
  activeKey?: string | null;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function LegendItem({
  label,
  value,
  color,
  gap = "4px",
  tooltip,
  icon,
  itemKey,
  activeKey,
  onMouseEnter,
  onMouseLeave,
}: LegendItemProps) {
  const highlight =
    itemKey != null ? getHighlight(activeKey, itemKey) : undefined;
  const item = (
    <Flex
      align="center"
      gap={gap}
      className={clsx(styles.legendItemKey, {
        [styles.legendItemActive]: highlight === "active",
        [styles.dimmed]: highlight === "dimmed",
      })}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {color !== undefined ? (
        <Box
          as="span"
          width="3px"
          height="10px"
          flexShrink="0"
          style={{ background: color }}
        />
      ) : (
        icon
      )}
      <Text>{label}</Text>
      {value !== undefined && (
        <Text className={styles.legendItemValue}>{value}</Text>
      )}
    </Flex>
  );

  return tooltip ? (
    <ResourceTooltip content={tooltip}>{item}</ResourceTooltip>
  ) : (
    item
  );
}
