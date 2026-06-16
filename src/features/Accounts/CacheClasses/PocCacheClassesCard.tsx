import { Flex, Table, Tooltip } from "@radix-ui/themes";
import { clamp } from "lodash";
import { useAtomValue } from "jotai";
import { type CSSProperties } from "react";
import clsx from "clsx";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import DataTable from "../../../components/DataTable";
import TableDescriptionDialog from "../../../components/TableDescriptionDialog";
import { cacheClassGroups } from "./consts";
import { cacheClassList } from "../consts";
import type { AccountsStats } from "../../../api/types";
import tableStyles from "../../../components/dataTable.module.css";
import styles from "./pocCacheClassesCard.module.css";
import cacheStyles from "./cacheClasses.module.css";
import { formatHitRate, formatRate } from "../../../utils";

export default function PocCacheClassesCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return null;

  return (
    <Card>
      <Flex direction="column" gap="7px">
        <Flex align="center" gap="5px">
          <CardHeader text="Cache Classes" />
          <TableDescriptionDialog groups={cacheClassGroups} />
        </Flex>
        <DataTable
          groups={cacheClassGroups}
          TableBody={PocCacheClassesTableBody}
          hideGroupHeaders
        />
      </Flex>
    </Card>
  );
}

function PocCacheClassesTableBody({ isPinned }: { isPinned?: boolean }) {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return null;

  return (
    <Table.Body>
      {accountStats.cache.classes.map((cacheClass) =>
        isPinned ? (
          <PinnedRow key={cacheClass.class} cacheClass={cacheClass} />
        ) : (
          <PocDataRow key={cacheClass.class} cacheClass={cacheClass} />
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

function PocDataRow({ cacheClass }: { cacheClass: CacheClass }) {
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
        <PocUsageBar
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
        <span className={cacheStyles.secondary}>{committedPct}</span>
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

interface PocUsageBarProps {
  usedSlots: number;
  maxSlots: number;
  targetSlots: number;
  lowWaterSlots: number;
}

function PocUsageBar({
  usedSlots,
  maxSlots,
  targetSlots,
  lowWaterSlots,
}: PocUsageBarProps) {
  const POWER = 1;
  const powerScale = (value: number) =>
    maxSlots > 0 ? Math.pow(value / maxSlots, POWER) : 0;

  const pct = clamp(powerScale(usedSlots), 0, 1);
  const lowWaterFrac = powerScale(lowWaterSlots);
  const targetFrac = powerScale(targetSlots);
  const zone1Frac = Math.min(lowWaterFrac, targetFrac);
  const zone2Frac = Math.max(lowWaterFrac, targetFrac);
  const zone1Pct = `${(zone1Frac * 100).toFixed(2)}%`;
  const zone2Pct = `${(zone2Frac * 100).toFixed(2)}%`;

  const inRed = pct > zone2Frac;
  const inYellow = !inRed && pct > zone1Frac;

  const pctClass = inRed
    ? cacheStyles.pctDanger
    : inYellow
      ? cacheStyles.pctWarn
      : undefined;

  const lowWaterPct =
    maxSlots > 0 ? ((lowWaterSlots / maxSlots) * 100).toFixed(1) : "0.0";
  const targetPct =
    maxSlots > 0 ? ((targetSlots / maxSlots) * 100).toFixed(1) : "0.0";
  const tooltipContent = (
    <Flex direction="column" gap="2px">
      <span className={cacheStyles.pctWarn}>
        Target: {targetSlots.toLocaleString()} slots ({targetPct}%)
      </span>
      <span className={cacheStyles.pctDanger}>
        Low water: {lowWaterSlots.toLocaleString()} slots ({lowWaterPct}%)
      </span>
    </Flex>
  );

  return (
    <Flex align="center" gap="8px" className={cacheStyles.usageBar}>
      <Tooltip content={tooltipContent} side="right">
        <div
          className={styles.barsWrap}
          style={
            {
              "--bar-width": "2px",
              "--bar-gap": "0px",
              "--pct": pct,
              "--low-water-frac": lowWaterFrac,
              "--target-frac": targetFrac,
              "--zone-1-pct": zone1Pct,
              "--zone-2-pct": zone2Pct,
            } as CSSProperties
          }
        >
          <div className={styles.bars} />
          <div className={styles.lowWaterMarker} />
          <div className={styles.targetMarker} />
        </div>
      </Tooltip>
      <span className={clsx(cacheStyles.secondary, pctClass)}>
        {maxSlots > 0 ? Math.round((usedSlots / maxSlots) * 100) : 0}%
      </span>
    </Flex>
  );
}
