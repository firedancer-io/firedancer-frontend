import { Tooltip } from "@radix-ui/themes";
import clsx from "clsx";
import { formatSIBytesStr } from "../../../utils";
import type { ResourceSegment } from "./utils";
import styles from "./resourcesCard.module.css";

interface SegmentedBarProps {
  segments: ResourceSegment[];
  total: number;
  ariaLabel: string;
  /** Tile indices currently emphasized; other tile segments dim. */
  activeTileIdxs?: number[];
  onHover?: (tileIdxs: number[]) => void;
  onSelect?: (tileIdxs: number[]) => void;
}

export default function SegmentedBar({
  segments,
  total,
  ariaLabel,
  activeTileIdxs = [],
  onHover,
  onSelect,
}: SegmentedBarProps) {
  const hasActive = activeTileIdxs.length > 0;

  return (
    <div className={styles.segmentedBar} aria-label={ariaLabel}>
      {segments.map((segment) => {
        const width = total > 0 ? (segment.bytes / total) * 100 : 0;
        if (width <= 0) return null;

        const isTile = segment.tileIdx != null;
        const isActive =
          isTile && activeTileIdxs.includes(segment.tileIdx as number);

        return (
          <Tooltip
            key={segment.key}
            content={`${segment.label}: ${formatSIBytesStr(segment.bytes)}`}
          >
            <div
              className={clsx(styles.barSegment, {
                [styles.segmentActive]: isActive,
                [styles.segmentDimmed]: hasActive && isTile && !isActive,
                [styles.segmentInteractive]: isTile,
              })}
              data-tile-interactive={isTile ? "" : undefined}
              style={{
                background: segment.color,
                flexBasis: `${width}%`,
              }}
              onMouseEnter={
                isTile && onHover
                  ? () => onHover([segment.tileIdx as number])
                  : undefined
              }
              onMouseLeave={isTile && onHover ? () => onHover([]) : undefined}
              onClick={
                isTile && onSelect
                  ? () => onSelect([segment.tileIdx as number])
                  : undefined
              }
            >
              {width >= 12 && (
                <span className={styles.segmentLabel}>{segment.label}</span>
              )}
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}
