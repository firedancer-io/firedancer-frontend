import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
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

const storageStatsMinWidth = "110px";
const readWriteStatsMinWidth = "120px";
const gap = "16px";
const dividerColor = "#ffffff33";

export default function DiskCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

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
      <Flex direction="column" height="100%" gap="15px" justify="between">
        <CardHeader text="Disk" />
        <Flex gap={gap} wrap="wrap">
          <Flex gap={gap} wrap="wrap">
            <Flex direction="column" justify="between" wrap="wrap" gap={gap}>
              <Flex gap={gap}>
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

            <div style={{ width: 1, background: dividerColor }} />

            <Flex direction="column" justify="between" gap={gap}>
              <Flex gap={gap}>
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

              <Flex gap={gap}>
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
