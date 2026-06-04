import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { formatSIBytes } from "../../../utils";
import Stat from "../Stat";

import styles from "./ioCard.module.css";

const MAX_BYTES = 100 * 1_000_000; // 100 MB

export default function IOCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  const readPerSec = formatSIBytes(accountStats.io.bytes_read_per_sec);
  const writePerSec = formatSIBytes(accountStats.io.bytes_written_per_sec);
  const copiedPerSec = formatSIBytes(accountStats.io.bytes_copied_per_sec);

  const readPct = Math.min(
    (accountStats.io.bytes_read_per_sec / MAX_BYTES) * 100,
    100,
  );
  const writePct = Math.min(
    (accountStats.io.bytes_written_per_sec / MAX_BYTES) * 100,
    100,
  );

  return (
    <Card>
      <Flex direction="column" gap="7px">
        <CardHeader text="I/O" />
        <Flex gap="2">
          <Flex gap="8px" align="center">
            <Stat
              value={`${readPerSec.value} ${readPerSec.unit}/s`}
              size="lg"
              suffix="Read"
            />
            <VerticalProgress value={readPct} />
          </Flex>
          <Flex gap="8px" align="center">
            <VerticalProgress value={writePct} />
            <Stat
              value={`${writePerSec.value} ${writePerSec.unit}/s`}
              size="lg"
              suffix="Write"
            />
          </Flex>
        </Flex>
        <Flex justify="between" gap="2">
          <Stat
            className={styles.copied}
            label="Copied"
            value={`${copiedPerSec.value} ${copiedPerSec.unit}/s`}
          />
          <Stat
            className={styles.perSecStat}
            label="R/S"
            value={Math.round(
              accountStats.io.read_ops_per_sec,
            ).toLocaleString()}
          />
          <Stat
            className={styles.perSecStat}
            label="W/S"
            value={Math.round(
              accountStats.io.write_ops_per_sec,
            ).toLocaleString()}
          />
          <Stat
            label="Prewrite"
            value={`${(accountStats.io.prewrite_ratio * 100).toFixed(1)}%`}
          />
        </Flex>
      </Flex>
    </Card>
  );
}

function VerticalProgress({ value }: { value: number }) {
  return (
    <div className={styles.verticalProgressGutter}>
      <div
        className={styles.verticalProgressFill}
        style={{ height: `${value}%` }}
      />
    </div>
  );
}
