import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom, bootProgressAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { formatSIBytes } from "../../../utils";
import Stat from "../Stat";
import DiskPieChart from "./DiskPieChart";
import {
  accountsFragmentedColor,
  accountsReadColor,
  accountsSecondaryColor,
  accountsUsedColor,
  accountsWriteColor,
} from "../../../colors";
import CopyButton from "../../../components/CopyButton";
import styles from "./diskCard.module.css";

const storageStatsMinWidth = "110px";
const readWriteStatsMinWidth = "120px";

export default function DiskCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  const bootProgress = useAtomValue(bootProgressAtom);

  if (!accountStats) return;

  const dbPath = bootProgress?.accounts_database_path;

  const used = formatSIBytes(accountStats.disk.used_bytes);
  const allocated = formatSIBytes(accountStats.disk.allocated_bytes);

  const fragBytes = Math.max(
    0,
    accountStats.disk.current_bytes - accountStats.disk.used_bytes,
  );
  const frag = formatSIBytes(fragBytes);

  const unusedBytes = Math.max(
    0,
    accountStats.disk.allocated_bytes - accountStats.disk.current_bytes,
  );
  const readPerSec = formatSIBytes(accountStats.io.bytes_read_per_sec);
  const writePerSec = formatSIBytes(accountStats.io.bytes_written_per_sec);

  return (
    <Card>
      <Flex direction="column" height="100%" gap="5px">
        <CardHeader text="Disk" />

        <Flex gap="16px" wrap="wrap" flexGrow="1">
          <Flex direction="column" gap="5px" justify="between">
            {dbPath && (
              <CopyButton value={dbPath} className={styles.dbPath}>
                <Text size="2">{dbPath}</Text>
              </CopyButton>
            )}

            <Flex gap="16px" wrap="wrap">
              <Flex direction="column" justify="between" wrap="wrap" gap="5px">
                <Flex gap="5px">
                  <Stat
                    label="Used"
                    size="lg"
                    value={used.value}
                    color={accountsUsedColor}
                    suffix={used.unit}
                    minWidth={storageStatsMinWidth}
                  />
                  <Stat
                    label="Fragmentation"
                    size="lg"
                    value={frag.value}
                    color={accountsFragmentedColor}
                    suffix={frag.unit}
                    minWidth={storageStatsMinWidth}
                  />
                </Flex>

                <Stat
                  label="Allocated"
                  value={allocated.value}
                  color={accountsSecondaryColor}
                  suffix={allocated.unit}
                  minWidth={storageStatsMinWidth}
                />
              </Flex>

              <div className={styles.divider} />

              <Flex direction="column" justify="between" gap="5px">
                <Flex gap="5px">
                  <Stat
                    label="Read"
                    value={`${readPerSec.value}`}
                    size="lg"
                    suffix={`${readPerSec.unit}/s`}
                    color={accountsReadColor}
                    minWidth={readWriteStatsMinWidth}
                  />
                  <Stat
                    label="Write"
                    value={`${writePerSec.value}`}
                    size="lg"
                    suffix={`${writePerSec.unit}/s`}
                    color={accountsWriteColor}
                    minWidth={readWriteStatsMinWidth}
                  />
                </Flex>

                <Flex gap="5px">
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

          <DiskPieChart
            usedBytes={accountStats.disk.used_bytes}
            fragBytes={fragBytes}
            unusedBytes={unusedBytes}
          />
        </Flex>
      </Flex>
    </Card>
  );
}
