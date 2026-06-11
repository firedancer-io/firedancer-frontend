import { Flex, Table } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import DataTable from "../../../components/DataTable";
import TableDescriptionDialog from "../../../components/TableDescriptionDialog";
import { cacheClassGroups } from "./consts";
import type { AccountsStats } from "../../../api/types";
import tableStyles from "../../../components/dataTable.module.css";
import styles from "./cacheClasses.module.css";
import { cacheClassList } from "../consts";
import { formatHitRate, formatRate } from "../../../utils";
import clsx from "clsx";

export default function CacheClasses() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

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
  if (!accountStats) return null;

  return (
    <Table.Body>
      {accountStats.cache.classes.map((cacheClass) =>
        isPinned ? (
          <PinnedRow key={cacheClass.class} cacheClass={cacheClass} />
        ) : (
          <DataRow key={cacheClass.class} cacheClass={cacheClass} />
        ),
      )}
    </Table.Body>
  );
}

type CacheClass = AccountsStats["cache"]["classes"][number];

function PinnedRow({ cacheClass }: { cacheClass: CacheClass }) {
  const label = cacheClassList[cacheClass.class]?.label ?? cacheClass.class;
  return (
    <Table.Row className={tableStyles.dataRow}>
      <Table.Cell className={tableStyles.rightBorder}>{label}</Table.Cell>
    </Table.Row>
  );
}

function DataRow({ cacheClass }: { cacheClass: CacheClass }) {
  const committedPerSec =
    cacheClass.committed_new_per_sec + cacheClass.committed_overwrite_per_sec;
  const committedPct =
    cacheClass.writes_per_sec > 0
      ? `${Math.round((committedPerSec / cacheClass.writes_per_sec) * 100)}%`
      : "";

  return (
    <Table.Row className={tableStyles.dataRow}>
      <Table.Cell align="right">
        {cacheClass.max_slots.toLocaleString()}
      </Table.Cell>
      <Table.Cell align="right">
        {cacheClass.used_slots.toLocaleString()}
      </Table.Cell>
      <Table.Cell>
        <UsageBar
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
      <Table.Cell align="right">
        <span
          className={
            cacheClass.hit_rate_ema >= 1
              ? tableStyles.green
              : cacheClass.hit_rate_ema > 0.999
                ? tableStyles.orange
                : tableStyles.red
          }
        >
          {formatHitRate(cacheClass.hit_rate_ema)}%
        </span>
      </Table.Cell>
      <Table.Cell align="right">
        {formatRate(cacheClass.reads_per_sec)}
      </Table.Cell>
      <Table.Cell align="right">
        {formatRate(cacheClass.writes_per_sec)}
      </Table.Cell>
      <Table.Cell align="right">
        {formatRate(committedPerSec)}
        <span className={styles.secondary}>{committedPct}</span>
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

interface UsageBarProps {
  usedSlots: number;
  maxSlots: number;
  targetSlots: number;
  lowWaterSlots: number;
}

function UsageBar({
  usedSlots,
  maxSlots,
  targetSlots,
  lowWaterSlots,
}: UsageBarProps) {
  const pct = maxSlots > 0 ? (usedSlots / maxSlots) * 100 : 0;
  const targetPct = maxSlots > 0 ? (targetSlots / maxSlots) * 100 : 0;
  const lowWaterPct = maxSlots > 0 ? (lowWaterSlots / maxSlots) * 100 : 0;
  const overTarget = targetSlots > 0 && usedSlots > targetSlots;
  const fillPct = Math.min(100, pct);

  return (
    <Flex align="center" gap="8px" className={styles.usageBar}>
      <div
        className={styles.track}
        title={`${usedSlots.toLocaleString()} / ${maxSlots.toLocaleString()} slots (${pct.toFixed(1)}%)`}
      >
        <div
          className={clsx(styles.fill, overTarget && styles.fillWarn)}
          style={{ width: `${fillPct.toFixed(1)}%` }}
        />
        {targetPct > 0 && targetPct < 100 && (
          <div
            className={clsx(styles.marker, styles.markerTarget)}
            style={{ left: `${targetPct.toFixed(1)}%` }}
            title={`Target: ${targetSlots.toLocaleString()} slots (${targetPct.toFixed(1)}%)`}
          />
        )}
        {lowWaterPct > 0 && lowWaterPct < 100 && (
          <div
            className={clsx(styles.marker, styles.markerLowWater)}
            style={{ left: `${lowWaterPct.toFixed(1)}%` }}
            title={`Preevict trigger: ${lowWaterSlots.toLocaleString()} slots (${lowWaterPct.toFixed(1)}%)`}
          />
        )}
      </div>
      <span className={clsx(styles.secondary, overTarget && styles.pctWarn)}>
        {Math.round(pct)}%
      </span>
    </Flex>
  );
}
