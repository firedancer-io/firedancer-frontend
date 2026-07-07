import { Flex, Table, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import DataTable from "../../../components/DataTable";
import TableDescriptionDialog from "../../../components/TableDescriptionDialog";
import { cacheClassGroups } from "./consts";
import {
  cacheClassColors,
  cacheClassUnusedColors,
  cacheClassList,
} from "../consts";
import type { AccountsStats } from "../../../api/types";
import tableStyles from "../../../components/dataTable.module.css";
import styles from "./cacheClasses.module.css";
import accountStyles from "../accounts.module.css";
import { formatHitRate, formatRate, getSafePct } from "../../../utils";
import CacheSpace from "./CacheSpace";
import Usage from "./Usage";

type CacheClass = AccountsStats["cache"]["classes"][number];

export default function CacheClasses() {
  return (
    <Card>
      <Flex direction="column" gap="7px">
        <Flex align="center" gap="5px">
          <CardHeader text="Cache Classes" />
          <TableDescriptionDialog groups={cacheClassGroups} />
        </Flex>
        <DataTable
          groups={cacheClassGroups}
          TableBody={CacheClassesTableBody}
          hideGroupHeaders
        />
      </Flex>
    </Card>
  );
}

function CacheClassesTableBody({ isPinned }: { isPinned?: boolean }) {
  const accountStats = useAtomValue(accountsStatsAtom);
  const data = accountStats?.cache.classes;

  const overallMaxBytes = useMemo(
    () =>
      data
        ? Math.max(
            ...data.map(
              (c) => c.max_slots * (cacheClassList[c.class]?.bytes ?? 0),
            ),
          )
        : 0,
    [data],
  );

  if (!data) return;

  return (
    <Table.Body>
      {data.map((cacheClass, i) =>
        isPinned ? (
          <PinnedRow key={cacheClass.class} cacheClass={cacheClass} />
        ) : (
          <DataRow
            key={cacheClass.class}
            idx={i}
            cacheClass={cacheClass}
            overallMaxBytes={overallMaxBytes}
          />
        ),
      )}
    </Table.Body>
  );
}

function PinnedRow({ cacheClass }: { cacheClass: CacheClass }) {
  const label = cacheClassList[cacheClass.class]?.label ?? cacheClass.class;
  return (
    <Table.Row className={tableStyles.dataRow}>
      <Table.Cell className={tableStyles.rightBorder}>{label}</Table.Cell>
    </Table.Row>
  );
}

function DataRow({
  idx,
  cacheClass,
  overallMaxBytes,
}: {
  idx: number;
  cacheClass: CacheClass;
  overallMaxBytes: number;
}) {
  const committedPerSec =
    cacheClass.committed_new_per_sec + cacheClass.committed_overwrite_per_sec;
  const committedPct = `${Math.round(getSafePct(committedPerSec, cacheClass.writes_per_sec))}%`;

  const color = cacheClassColors[idx % cacheClassColors.length];
  const unusedColor =
    cacheClassUnusedColors[idx % cacheClassUnusedColors.length];

  const bytesPerSlot = cacheClassList[cacheClass.class]?.bytes ?? 0;
  const usedBytes = cacheClass.used_slots * bytesPerSlot;
  const maxBytes = cacheClass.max_slots * bytesPerSlot;
  const usedPct = getSafePct(usedBytes, overallMaxBytes);
  const unusedPct = getSafePct(maxBytes - usedBytes, overallMaxBytes);

  return (
    <Table.Row className={tableStyles.dataRow}>
      <Table.Cell align="right">
        {cacheClass.max_slots.toLocaleString()}
      </Table.Cell>
      <Table.Cell align="right">
        {cacheClass.used_slots.toLocaleString()}
      </Table.Cell>
      <Table.Cell>
        {overallMaxBytes > 0 && (
          <CacheSpace
            usedBytes={usedBytes}
            usedPct={usedPct}
            unusedPct={unusedPct}
            color={color}
            unusedColor={unusedColor}
          />
        )}
      </Table.Cell>
      <Table.Cell>
        <Usage
          usedSlots={cacheClass.used_slots}
          maxSlots={cacheClass.max_slots}
          targetSlots={cacheClass.target_used_slots}
          lowWaterSlots={cacheClass.low_water_used_slots}
        />
      </Table.Cell>
      <Table.Cell align="right">
        {cacheClass.reserved_slots < Number.MAX_SAFE_INTEGER
          ? cacheClass.reserved_slots.toLocaleString()
          : "-"}
      </Table.Cell>
      <Table.Cell
        align="right"
        className={
          cacheClass.hit_rate_ema >= 1
            ? tableStyles.green
            : cacheClass.hit_rate_ema > 0.999
              ? tableStyles.orange
              : tableStyles.red
        }
      >
        {formatHitRate(cacheClass.hit_rate_ema)}%
      </Table.Cell>
      <Table.Cell align="right" className={accountStyles.read}>
        {formatRate(cacheClass.reads_per_sec)}
      </Table.Cell>
      <Table.Cell align="right" className={accountStyles.write}>
        {formatRate(cacheClass.writes_per_sec)}
      </Table.Cell>
      <Table.Cell align="right">
        {formatRate(committedPerSec)}
        <Text className={styles.secondaryText}>{committedPct}</Text>
      </Table.Cell>
      <Table.Cell align="right">
        {formatRate(cacheClass.not_found_per_sec)}
      </Table.Cell>
      <Table.Cell align="right">
        {formatRate(cacheClass.evicted_per_sec)}
      </Table.Cell>
      <Table.Cell align="right">
        {formatRate(cacheClass.preevicted_per_sec)}
      </Table.Cell>
    </Table.Row>
  );
}
