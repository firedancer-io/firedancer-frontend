import { Tooltip } from "@radix-ui/themes";
import { formatSIBytesStr } from "../../../utils";
import type { ResourceSegment } from "./utils";
import styles from "./resourcesCard.module.css";

interface SegmentedBarProps {
  segments: ResourceSegment[];
  total: number;
  ariaLabel: string;
}

export default function SegmentedBar({
  segments,
  total,
  ariaLabel,
}: SegmentedBarProps) {
  return (
    <div className={styles.segmentedBar} aria-label={ariaLabel}>
      {segments.map((segment) => {
        const width = total > 0 ? (segment.bytes / total) * 100 : 0;
        if (width <= 0) return null;

        return (
          <Tooltip
            key={segment.key}
            content={`${segment.label}: ${formatSIBytesStr(segment.bytes)}`}
          >
            <div
              className={styles.barSegment}
              style={{
                background: segment.color,
                flexBasis: `${width}%`,
              }}
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
