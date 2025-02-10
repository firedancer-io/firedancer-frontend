import { Box, Flex, Progress, Text } from "@radix-ui/themes";
import styles from "./startupProgress.module.css";
import { Duration } from "luxon";
import { getTimeTillText } from "../../utils";
import byteSize from "byte-size";

interface SnapshotProgressProps {
  currentBytes: number | null;
  totalBytes: number | null;
  remainingSecs: number | null;
}

export default function SnapshotProgress({
  currentBytes,
  totalBytes,
  remainingSecs,
}: SnapshotProgressProps) {
  const pct =
    currentBytes && totalBytes ? (currentBytes / totalBytes) * 100 : 0;

  const remainingDuration =
    remainingSecs !== null
      ? Duration.fromMillis(remainingSecs * 1_000).rescale()
      : undefined;

  const getFormattedSize = () => {
    if (!totalBytes) return "";

    const totalFormatted = byteSize(totalBytes, { units: "iec" });
    const currentRatio = currentBytes ? currentBytes / totalBytes : 0;

    const totalNumber = Number(totalFormatted.value);
    const currentFormatted = !isNaN(totalNumber)
      ? (totalNumber * currentRatio).toFixed(1)
      : "0";

    return `${currentFormatted} / ${totalFormatted.toString()}`;
  };

  return (
    <Flex>
      <Flex direction="column">
        <Box minHeight="10px" />
        <Progress value={pct} className={styles.progress} />
        <Flex minHeight="10px">
          <Text className={styles.text}>{getFormattedSize()}</Text>
          <Box flexGrow="1" />
          <Text className={styles.text}>
            ~{getTimeTillText(remainingDuration)}
          </Text>
        </Flex>
      </Flex>
    </Flex>
  );
}
