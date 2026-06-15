import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { formatCount, formatIECBytes, formatSIBytes } from "../../../utils";
import Stat from "../Stat";
import { Pie } from "@nivo/pie";
import AutoSizer from "react-virtualized-auto-sizer";

import styles from "./cacheCard.module.css";
import pieStyles from "./pocCacheCard.module.css";
import { cacheClassList } from "../consts";

const CLASS_COLORS = [
  "#60a5fa", // blue
  "#22d3ee", // cyan
  "#34d399", // emerald
  "#a3e635", // lime
  "#fbbf24", // amber
  "#f87171", // coral/red
  "#a78bfa", // violet
  "#f472b6", // pink
];
const UNUSED_COLOR = "var(--gray-6)";

export default function PocCacheCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
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

  const totalUsedSlots = cacheClasses.reduce((a, c) => a + c.used_slots, 0);
  const totalMaxSlots = cacheClasses.reduce((a, c) => a + c.max_slots, 0);
  const totalUsedBytes = cacheClasses.reduce(
    (a, c) => a + c.used_slots * (cacheClassList[c.class]?.bytes ?? 0),
    0,
  );
  const totalCapacityBytes = accountStats.cache.size_bytes;
  const unusedBytes = Math.max(0, totalCapacityBytes - totalUsedBytes);

  const fmtTotalUsedBytes = formatIECBytes(totalUsedBytes, 2);
  const fmtTotalCapBytes = formatIECBytes(totalCapacityBytes, 2);
  const fmtTotalUsedSlots = formatCount(totalUsedSlots, 2);
  const fmtTotalMaxSlots = formatCount(totalMaxSlots, 2);

  const classRows = cacheClasses.map((c, i) => {
    const classInfo = cacheClassList[c.class];
    const usedBytes = c.used_slots * (classInfo?.bytes ?? 0);
    const fmtBytes = formatIECBytes(usedBytes, 1);
    return {
      id: `class-${c.class}`,
      label: classInfo?.label ?? `Class ${c.class}`,
      value: usedBytes,
      color: CLASS_COLORS[i % CLASS_COLORS.length],
      usedSlots: c.used_slots,
      fmtBytes,
    };
  });

  const pieData = [
    ...classRows
      .filter((r) => r.value > 0)
      .map(({ id, label, value, color }) => ({ id, label, value, color })),
    { id: "unused", label: "Unused", value: unusedBytes, color: UNUSED_COLOR },
  ];

  return (
    <Card>
      <Flex direction="column" gap="7px">
        <CardHeader text="Cache" />
        <Flex gap="8px" align="baseline">
          <Stat
            className={styles.pct}
            value={hitRate.toFixed(2)}
            size="lg"
            color="#EC5D5E"
            suffix="% hit"
          />
        </Flex>
        <Flex gap="3" align="center" minHeight="130px">
          <div className={pieStyles.pieWrap}>
            <AutoSizer>
              {({ height, width }) => (
                <Pie
                  height={height}
                  width={width}
                  data={pieData}
                  colors={{ datum: "data.color" }}
                  enableArcLabels={false}
                  enableArcLinkLabels={false}
                  innerRadius={0.65}
                  animate={false}
                  tooltip={() => null}
                  layers={[
                    "arcs",
                    (props) => (
                      <CenterLabel
                        {...props}
                        usedLabel={`${fmtTotalUsedBytes.value} ${fmtTotalUsedBytes.unit}`}
                        capLabel={`${fmtTotalCapBytes.value} ${fmtTotalCapBytes.unit}`}
                        slotsLabel={`${fmtTotalUsedSlots.value}${fmtTotalUsedSlots.unit}/${fmtTotalMaxSlots.value}${fmtTotalMaxSlots.unit}`}
                      />
                    ),
                  ]}
                />
              )}
            </AutoSizer>
          </div>
          <Flex direction="column" gap="1" flexShrink="0" overflow="hidden">
            {classRows.map((row) => (
              <ClassLegendRow key={row.id} {...row} />
            ))}
          </Flex>
        </Flex>
        <Flex justify="between" gap="2">
          <Stat label="R/S" value={`${readsPerSec.value}${readsPerSec.unit}`} />
          <Stat
            label="W/S"
            value={`${writesPerSec.value}${writesPerSec.unit}`}
          />
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

function CenterLabel({
  centerX,
  centerY,
  usedLabel,
  capLabel,
  slotsLabel,
}: {
  centerX: number;
  centerY: number;
  innerRadius: number;
  radius: number;
  usedLabel: string;
  capLabel: string;
  slotsLabel: string;
}) {
  return (
    <text textAnchor="middle" dominantBaseline="central">
      <tspan
        x={centerX}
        y={centerY - 14}
        style={{ fontSize: "10px", fill: "var(--gray-11)", fontWeight: 600 }}
      >
        {usedLabel}
      </tspan>
      <tspan
        x={centerX}
        y={centerY - 3}
        style={{ fontSize: "10px", fill: "var(--gray-8)" }}
      >
        {`/ ${capLabel}`}
      </tspan>
      <tspan
        x={centerX}
        y={centerY + 10}
        style={{ fontSize: "9px", fill: "var(--gray-8)" }}
      >
        {slotsLabel}
      </tspan>
    </text>
  );
}

function ClassLegendRow({
  color,
  label,
  fmtBytes,
  usedSlots,
}: {
  color: string;
  label: string;
  fmtBytes: ReturnType<typeof formatIECBytes>;
  usedSlots: number;
}) {
  const dim = usedSlots === 0;
  return (
    <Flex align="center" gap="2">
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
          minWidth: 44,
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
