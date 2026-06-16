import { useState } from "react";
import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { formatCount, formatIECBytes, formatSIBytes } from "../../../utils";
import Stat from "../Stat";

import styles from "./cacheCard.module.css";
import { cacheClassList } from "../consts";

const CLASS_COLORS = [
  "#5055B4",
  "#507DAF",
  "#50A7AF",
  "#50AF82",
  "#82AF50",
  "#AFAA50",
  "#AF7D50",
  "#AF5050",
  "#AF509D",
  "#9150AF",
];

function darkenHex(hex: string, factor: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.round(((num >> 16) & 0xff) * (1 - factor));
  const g = Math.round(((num >> 8) & 0xff) * (1 - factor));
  const b = Math.round((num & 0xff) * (1 - factor));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

type ClassRow = {
  id: string;
  label: string;
  color: string;
  darkerColor: string;
  usedSlots: number;
  maxSlots: number;
  usedBytes: number;
  maxBytes: number;
  fmtBytes: ReturnType<typeof formatIECBytes>;
};

export default function PocCacheCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  const [legendVisible, setLegendVisible] = useState(false);
  if (!accountStats) return;

  const cacheClasses = accountStats.cache.classes;

  const hitRate = accountStats.cache.hit_rate_ema * 100;
  const readsPerSec = formatCount(
    Math.max(
      0,
      accountStats.io.acquired_per_sec -
        accountStats.io.acquired_writable_per_sec,
    ),
  );
  const writesPerSec = formatCount(accountStats.io.acquired_writable_per_sec);
  const copiedPerSec = formatSIBytes(accountStats.io.bytes_copied_per_sec);

  const usedSlots = cacheClasses.reduce((a, c) => a + c.used_slots, 0);
  const maxSlots = cacheClasses.reduce((a, c) => a + c.max_slots, 0);
  const fmtUsedSlots = formatCount(usedSlots, 2);
  const fmtMaxSlots = formatCount(maxSlots, 2);

  const sizeBytes = formatIECBytes(accountStats.cache.size_bytes, 2);
  const usedBytes = formatIECBytes(
    cacheClasses.reduce(
      (a, c) => a + c.used_slots * (cacheClassList[c.class]?.bytes ?? 0),
      0,
    ),
    2,
  );

  const classRows: ClassRow[] = cacheClasses.map((c, i) => {
    const classInfo = cacheClassList[c.class];
    const color = CLASS_COLORS[i % CLASS_COLORS.length];
    const usedBytes = c.used_slots * (classInfo?.bytes ?? 0);
    const maxBytes = c.max_slots * (classInfo?.bytes ?? 0);
    return {
      id: `class-${c.class}`,
      label: classInfo?.label ?? `Class ${c.class}`,
      color,
      darkerColor: darkenHex(color, 0.68),
      usedSlots: c.used_slots,
      maxSlots: c.max_slots,
      usedBytes,
      maxBytes,
      fmtBytes: formatIECBytes(usedBytes, 1),
    };
  });

  return (
    <Card>
      <Flex direction="column" gap="7px">
        <CardHeader text="Cache" />
        <Flex direction="column">
          <Flex gap="8px" align="baseline">
            <Stat
              className={styles.pct}
              value={hitRate.toFixed(2)}
              size="lg"
              color="#EC5D5E"
              suffix="% hit"
            />
            <Stat
              className={styles.perSecStat}
              value={`${readsPerSec.value}${readsPerSec.unit}`}
              color="var(--gray-12)"
              suffix="r/s"
            />
            <Stat
              className={styles.perSecStat}
              value={`${writesPerSec.value}${writesPerSec.unit}`}
              color="var(--gray-12)"
              suffix="w/s"
            />
          </Flex>
        </Flex>
        <Flex direction="column" gap="6px">
          <Flex justify="between" gap="2">
            <Stat
              label="Used"
              value={`${usedBytes.value} ${usedBytes.unit}`}
              suffix={`/ ${sizeBytes.value} ${sizeBytes.unit}`}
            />
            <Stat
              label="Slots"
              value={`${fmtUsedSlots.value} ${fmtUsedSlots.unit}`}
              suffix={`/ ${fmtMaxSlots.value} ${fmtMaxSlots.unit}`}
            />
          </Flex>
          <div
            style={{ position: "relative" }}
            onMouseEnter={() => setLegendVisible(true)}
            onMouseLeave={() => setLegendVisible(false)}
          >
            <CacheStackedBar classRows={classRows} />
            {legendVisible && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  background: "var(--color-panel-solid)",
                  border: "1px solid var(--gray-4)",
                  borderRadius: 6,
                  padding: "6px 8px",
                }}
              >
                <Flex direction="row" gap="2" wrap="wrap">
                  {classRows.map((row) => (
                    <ClassLegendRow key={row.id} {...row} />
                  ))}
                </Flex>
              </div>
            )}
          </div>
        </Flex>

        <Flex justify="between" gap="2">
          <Stat
            label="Copied"
            value={`${copiedPerSec.value} ${copiedPerSec.unit}/s`}
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

function CacheStackedBar({ classRows }: { classRows: ClassRow[] }) {
  const totalMaxBytes = classRows.reduce((a, r) => a + r.maxBytes, 0);
  if (totalMaxBytes === 0) return null;

  const usedRows = classRows.filter((r) => r.usedBytes > 0);
  const unusedRows = classRows
    .map((r) => ({ ...r, unusedBytes: r.maxBytes - r.usedBytes }))
    .filter((r) => r.unusedBytes > 0);

  const totalUsedBytes = usedRows.reduce((a, r) => a + r.usedBytes, 0);
  const totalUnusedBytes = unusedRows.reduce((a, r) => a + r.unusedBytes, 0);

  return (
    <div
      style={{
        display: "flex",
        height: 5,
        width: "100%",
        overflow: "hidden",
        gap: 0,
        borderRadius: "4px",
      }}
    >
      {totalUsedBytes > 0 && (
        <div
          style={{
            display: "flex",
            flex: totalUsedBytes / totalMaxBytes,
            gap: 0,
            minWidth: 0,
          }}
        >
          {usedRows.map((row) => (
            <div
              key={row.id}
              style={{
                flex: row.usedBytes,
                background: row.color,
                minWidth: 0,
              }}
            />
          ))}
        </div>
      )}
      {totalUnusedBytes > 0 && (
        <div
          style={{
            display: "flex",
            flex: totalUnusedBytes / totalMaxBytes,
            gap: 0,
            minWidth: 0,
          }}
        >
          {unusedRows.map((row) => (
            <div
              key={`${row.id}-unused`}
              style={{
                flex: row.unusedBytes,
                background: row.darkerColor,
                minWidth: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClassLegendRow({ color, label, fmtBytes, usedSlots }: ClassRow) {
  const dim = usedSlots === 0;
  return (
    <Flex align="center" gap="1" minWidth="100px">
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: 2,
          background: dim ? "var(--gray-5)" : color,
          flexShrink: 0,
        }}
      />
      <Text
        size="1"
        style={{
          color: dim ? "var(--gray-7)" : "var(--gray-9)",
        }}
      >
        {label}
      </Text>
      <Text
        size="1"
        style={{ color: dim ? "var(--gray-7)" : "var(--gray-11)" }}
      >
        {`${fmtBytes.value} ${fmtBytes.unit}`}
      </Text>
    </Flex>
  );
}
