import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import Stat from "../../Accounts/Stat";
import { formatCount, formatHitRate, formatSIBytes } from "../../../utils";
import {
  accountsReadColor,
  accountsWriteColor,
  accountsUsedColor,
  accountsFragmentedColor,
  accountsSecondaryColor,
} from "../../../colors";
import styles from "./accountsCard.module.css";
import { hitRateChangedColor, getHitRateStatus } from "../../../hitRate";
import { accountsNextCompactionAtom } from "../../../atoms";

const storageStatsMinWidth = "150px";
const readWriteStatsMinWidth = "120px";
const cacheStatsMinWidth = "80px";

export default function AccountsCard({ className }: { className?: string }) {
  const accountStats = useAtomValue(accountsStatsAtom);
  const nextCompaction = useAtomValue(accountsNextCompactionAtom);

  if (!accountStats) return null;

  const hitRateStatus = getHitRateStatus(accountStats.cache.hit_rate_ema);
  const hitRateColor = hitRateChangedColor(hitRateStatus);

  const readsPerSec = formatCount(
    Math.max(
      0,
      accountStats.io.acquired_per_sec -
        accountStats.io.acquired_writable_per_sec,
    ),
  );
  const writesPerSec = formatCount(accountStats.io.acquired_writable_per_sec);

  const used = formatSIBytes(accountStats.disk.used_bytes);
  const fragBytes = Math.max(
    0,
    accountStats.disk.current_bytes - accountStats.disk.used_bytes,
  );
  const frag = formatSIBytes(fragBytes);
  const readPerSec = formatSIBytes(accountStats.io.bytes_read_per_sec);
  const writePerSec = formatSIBytes(accountStats.io.bytes_written_per_sec);
  const allocated = formatSIBytes(accountStats.disk.allocated_bytes);

  return (
    <Card className={className}>
      <Flex direction="column" gap="2">
        <CardHeader text="Accounts" />

        <Flex gap="3" wrap="wrap">
          <Flex direction="column" gap="2" flexGrow="1">
            <div className={styles.sectionLabel}>Cache</div>
            <Stat
              label="Hit Rate"
              value={formatHitRate(accountStats.cache.hit_rate_ema)}
              size="lg"
              color={hitRateColor}
              suffix="%"
            />
            <Flex gap="2">
              <Stat
                label="R/S"
                value={`${readsPerSec.value}${readsPerSec.unit}`}
                color={accountsReadColor}
                minWidth={cacheStatsMinWidth}
              />
              <Stat
                label="W/S"
                value={`${writesPerSec.value}${writesPerSec.unit}`}
                color={accountsWriteColor}
                minWidth={cacheStatsMinWidth}
              />
            </Flex>
          </Flex>

          <Flex direction="column" gap="2" flexGrow="1">
            <div className={styles.sectionLabel}>Disk</div>
            <Flex gap="2">
              <Flex direction="column" gap="2">
                <Flex gap="2" wrap="wrap">
                  <Stat
                    label="Used"
                    value={used.value}
                    size="lg"
                    color={accountsUsedColor}
                    suffix={used.unit}
                    minWidth={storageStatsMinWidth}
                  />
                  <Stat
                    label="Fragmented"
                    value={frag.value}
                    size="lg"
                    color={accountsFragmentedColor}
                    suffix={frag.unit}
                    minWidth={storageStatsMinWidth}
                  />
                </Flex>
                <Flex gap="2" wrap="wrap">
                  <Stat
                    label="Allocated"
                    value={allocated.value}
                    color={accountsSecondaryColor}
                    suffix={allocated.unit}
                    minWidth={storageStatsMinWidth}
                  />
                  {nextCompaction && (
                    <Stat
                      label="Next Compaction"
                      value={nextCompaction.timeLabel}
                      color="#EEE"
                      minWidth={storageStatsMinWidth}
                    />
                  )}
                </Flex>
              </Flex>
              <Flex direction="column" gap="2">
                <Flex gap="2" wrap="wrap">
                  <Stat
                    label="Read"
                    value={readPerSec.value}
                    size="lg"
                    color={accountsReadColor}
                    suffix={`${readPerSec.unit}/s`}
                    minWidth={readWriteStatsMinWidth}
                  />
                  <Stat
                    label="Write"
                    value={writePerSec.value}
                    size="lg"
                    color={accountsWriteColor}
                    suffix={`${writePerSec.unit}/s`}
                    minWidth={readWriteStatsMinWidth}
                  />
                </Flex>
                <Flex gap="2" wrap="wrap">
                  <Stat
                    label="R/S"
                    value={Math.round(
                      accountStats.io.read_ops_per_sec,
                    ).toLocaleString()}
                    color={accountsReadColor}
                    minWidth={readWriteStatsMinWidth}
                  />
                  <Stat
                    label="W/S"
                    value={Math.round(
                      accountStats.io.write_ops_per_sec,
                    ).toLocaleString()}
                    color={accountsWriteColor}
                    minWidth={readWriteStatsMinWidth}
                  />
                </Flex>
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </Flex>
    </Card>
  );
}
