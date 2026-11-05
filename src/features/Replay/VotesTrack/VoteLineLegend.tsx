import clsx from "clsx";
import { Flex, Text } from "@radix-ui/themes";
import styles from "../trackControls.module.css";
import { LINE_WIDTH_PX, voteLineDashes, type VoteLine } from "./consts";

const items: { line: VoteLine; label: string }[] = [
  { line: "notar", label: "Notar" },
  { line: "notarFallback", label: "Notar + fallback" },
  { line: "skip", label: "Skip + fallback" },
  { line: "finalize", label: "Finalize" },
];

const SAMPLE_WIDTH_PX = 22;

export default function VoteLineLegend() {
  return (
    <Flex direction="column">
      <Text className={styles.sectionHeader}>Lines</Text>
      {items.map(({ line, label }) => (
        <div
          key={line}
          className={clsx(styles.option, styles.legendItem, styles.static)}
        >
          <svg width={SAMPLE_WIDTH_PX} height={6}>
            <line
              x1={0}
              x2={SAMPLE_WIDTH_PX}
              y1={3}
              y2={3}
              stroke="currentColor"
              strokeWidth={LINE_WIDTH_PX}
              strokeDasharray={voteLineDashes[line].join(" ")}
            />
          </svg>
          {label}
        </div>
      ))}
    </Flex>
  );
}
