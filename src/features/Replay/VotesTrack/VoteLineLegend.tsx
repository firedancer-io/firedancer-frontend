import clsx from "clsx";
import { Flex, Text } from "@radix-ui/themes";
import styles from "../trackControls.module.css";
import {
  LINE_WIDTH_PX,
  OWN_VOTE_LINE_ALPHA,
  OWN_VOTE_TRIANGLE_PX,
  DASH_PERIOD_PX,
  voteLineColors,
  voteLineDashPx,
  type VoteLine,
} from "./consts";

const items: { line: VoteLine; label: string }[] = [
  { line: "notar", label: "Notar" },
  { line: "notarFallback", label: "Notar + fallback" },
  { line: "skip", label: "Skip + fallback" },
  { line: "finalize", label: "Finalize" },
];

const ownVoteItems: { line: VoteLine; label: string }[] = [
  { line: "notar", label: "Our notar vote" },
  { line: "finalize", label: "Our finalize vote" },
];

const SAMPLE_WIDTH_PX = 22;
const MARKER_SAMPLE_HEIGHT_PX = 14;

interface VoteLineLegendProps {
  showOwnVotes: boolean;
}

export default function VoteLineLegend({ showOwnVotes }: VoteLineLegendProps) {
  return (
    <Flex direction="column">
      <Text className={styles.sectionHeader}>Lines</Text>
      <Flex direction="column" className={styles.legendItems}>
        {items.map(({ line, label }) => (
          <div
            key={line}
            className={clsx(styles.option, styles.legendItem, styles.static)}
          >
            <svg width={SAMPLE_WIDTH_PX} height={6} aria-hidden>
              <line
                x1={0}
                x2={SAMPLE_WIDTH_PX}
                y1={3}
                y2={3}
                stroke={voteLineColors[line]}
                strokeWidth={LINE_WIDTH_PX}
                strokeDasharray={
                  voteLineDashPx[line]
                    ? `${voteLineDashPx[line]} ${DASH_PERIOD_PX - voteLineDashPx[line]}`
                    : undefined
                }
              />
            </svg>
            {label}
          </div>
        ))}
        {showOwnVotes &&
          ownVoteItems.map(({ line, label }) => {
            const centerPx = SAMPLE_WIDTH_PX / 2;
            const halfPx = OWN_VOTE_TRIANGLE_PX / 2;
            return (
              <div
                key={label}
                className={clsx(
                  styles.option,
                  styles.legendItem,
                  styles.static,
                )}
              >
                <svg
                  width={SAMPLE_WIDTH_PX}
                  height={MARKER_SAMPLE_HEIGHT_PX}
                  aria-hidden
                >
                  <polygon
                    points={`${centerPx - halfPx},0 ${centerPx + halfPx},0 ${centerPx},${OWN_VOTE_TRIANGLE_PX}`}
                    fill={voteLineColors[line]}
                  />
                  <line
                    x1={centerPx}
                    x2={centerPx}
                    y1={OWN_VOTE_TRIANGLE_PX}
                    y2={MARKER_SAMPLE_HEIGHT_PX}
                    stroke={voteLineColors[line]}
                    strokeOpacity={OWN_VOTE_LINE_ALPHA}
                  />
                </svg>
                {label}
              </div>
            );
          })}
      </Flex>
    </Flex>
  );
}
