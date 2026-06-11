import { Flex, Text } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { Pie } from "@nivo/pie";
import AutoSizer from "react-virtualized-auto-sizer";
import { formatSIBytes } from "../../../utils";
import Stat from "../Stat";
import styles from "./diskPieChart.module.css";
import ioStyles from "../IOCard/ioCard.module.css";

const USED_COLOR = "var(--blue-9)";
const FRAG_COLOR = "var(--orange-9)";
const UNUSED_COLOR = "var(--gray-6)";

const MAX_BYTES = 100 * 1_000_000; // 100 MB

export default function DiskPieChart() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  const { allocated_bytes, used_bytes, current_bytes } = accountStats.disk;

  const fragBytes = current_bytes > used_bytes ? current_bytes - used_bytes : 0;
  const unusedBytes = Math.max(0, allocated_bytes - current_bytes);

  const usedPct = allocated_bytes ? (used_bytes / allocated_bytes) * 100 : 0;
  const fragPct = allocated_bytes ? (fragBytes / allocated_bytes) * 100 : 0;
  const unusedPct = allocated_bytes ? (unusedBytes / allocated_bytes) * 100 : 0;

  const usedFmt = formatSIBytes(used_bytes);
  const fragFmt = formatSIBytes(fragBytes);
  const unusedFmt = formatSIBytes(unusedBytes);
  const allocFmt = formatSIBytes(allocated_bytes);

  const readPerSec = formatSIBytes(accountStats.io.bytes_read_per_sec);
  const writePerSec = formatSIBytes(accountStats.io.bytes_written_per_sec);
  const readPct = Math.min(
    (accountStats.io.bytes_read_per_sec / MAX_BYTES) * 100,
    100,
  );
  const writePct = Math.min(
    (accountStats.io.bytes_written_per_sec / MAX_BYTES) * 100,
    100,
  );

  const data = [
    {
      id: "used",
      label: "Used",
      value: used_bytes,
      color: USED_COLOR,
      pct: usedPct,
    },
    {
      id: "fragmentation",
      label: "Fragmentation",
      value: fragBytes,
      color: FRAG_COLOR,
      pct: fragPct,
    },
    {
      id: "unused",
      label: "Unused",
      value: unusedBytes,
      color: UNUSED_COLOR,
      pct: unusedPct,
    },
  ];

  return (
    <Card>
      <Flex direction="column" gap="7px" height="100%">
        <CardHeader text="Disk" />
        <Flex gap="3" align="center" flexGrow="1" minHeight="120px">
          <div className={styles.pieWrap}>
            <AutoSizer>
              {({ height, width }) => (
                <Pie
                  height={height}
                  width={width}
                  data={data}
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
                        allocFmt={`${allocFmt.value} ${allocFmt.unit}`}
                      />
                    ),
                  ]}
                />
              )}
            </AutoSizer>
          </div>
          <Flex direction="column" gap="2" flexShrink="0">
            <LegendRow
              color={USED_COLOR}
              label="Used"
              value={`${usedFmt.value} ${usedFmt.unit}`}
              pct={usedPct}
            />
            <LegendRow
              color={FRAG_COLOR}
              label="Fragmentation"
              value={`${fragFmt.value} ${fragFmt.unit}`}
              pct={fragPct}
            />
            <LegendRow
              color={UNUSED_COLOR}
              label="Unused"
              value={`${unusedFmt.value} ${unusedFmt.unit}`}
              pct={unusedPct}
            />
          </Flex>
        </Flex>
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
        <Flex gap="2">
          <Stat
            className={ioStyles.perSecStat}
            label="R/S"
            value={Math.round(
              accountStats.io.read_ops_per_sec,
            ).toLocaleString()}
          />
          <Stat
            className={ioStyles.perSecStat}
            label="W/S"
            value={Math.round(
              accountStats.io.write_ops_per_sec,
            ).toLocaleString()}
          />
        </Flex>
      </Flex>
    </Card>
  );
}

function CenterLabel({
  centerX,
  centerY,
  allocFmt,
}: {
  centerX: number;
  centerY: number;
  innerRadius: number;
  radius: number;
  allocFmt: string;
}) {
  return (
    <text textAnchor="middle" dominantBaseline="central">
      <tspan
        x={centerX}
        y={centerY - 7}
        style={{ fontSize: "10px", fill: "var(--gray-9)" }}
      >
        allocated
      </tspan>
      <tspan
        x={centerX}
        y={centerY + 7}
        style={{ fontSize: "11px", fill: "var(--gray-11)", fontWeight: 600 }}
      >
        {allocFmt}
      </tspan>
    </text>
  );
}

function LegendRow({
  color,
  label,
  value,
  pct,
}: {
  color: string;
  label: string;
  value: string;
  pct: number;
}) {
  return (
    <Flex align="center" gap="2">
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: color,
          flexShrink: 0,
        }}
      />
      <Flex direction="column">
        <Text size="1" style={{ color: "var(--gray-9)" }}>
          {label}
        </Text>
        <Flex align="baseline" gap="1">
          <Text size="1" style={{ color: "var(--gray-11)", fontWeight: 500 }}>
            {value}
          </Text>
          <Text size="1" style={{ color: "var(--gray-9)" }}>
            {pct.toFixed(1)}%
          </Text>
        </Flex>
      </Flex>
    </Flex>
  );
}

function VerticalProgress({ value }: { value: number }) {
  return (
    <div className={ioStyles.verticalProgressGutter}>
      <div
        className={ioStyles.verticalProgressFill}
        style={{ height: `${value}%` }}
      />
    </div>
  );
}
