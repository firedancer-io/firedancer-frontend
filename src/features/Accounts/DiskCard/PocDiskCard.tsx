import { useId } from "react";
import { Flex } from "@radix-ui/themes";
import { tileBusyGreenColor, tileBusyRedColor } from "../../../colors";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import { formatSIBytes } from "../../../utils";
import Stat from "../Stat";
import DiskPieChart from "./DiskPieChart";
import styles from "./pocDiskCard.module.css";

const GAUGE_START = -108;
const GAUGE_END = 108;
const GAUGE_SWEEP = GAUGE_END - GAUGE_START;
const CX = 50,
  CY = 40,
  R = 34,
  SW = 6;

// Non-linear scale: each interval gets equal arc space
const INCREMENTS = [0, 1, 5, 10, 20, 50, 100]; // MB/s
const NUM_SEGS = INCREMENTS.length - 1;

function valueToAngle(mbps: number): number {
  const v = Math.min(100, Math.max(0, mbps));
  for (let i = 0; i < INCREMENTS.length - 1; i++) {
    if (v <= INCREMENTS[i + 1]) {
      const t = (v - INCREMENTS[i]) / (INCREMENTS[i + 1] - INCREMENTS[i]);
      return GAUGE_START + ((i + t) / NUM_SEGS) * GAUGE_SWEEP;
    }
  }
  return GAUGE_END;
}

export default function PocDiskCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  const readPerSec = formatSIBytes(accountStats.io.bytes_read_per_sec);
  const writePerSec = formatSIBytes(accountStats.io.bytes_written_per_sec);

  const readMBs = accountStats.io.bytes_read_per_sec / 1_000_000;
  const writeMBs = accountStats.io.bytes_written_per_sec / 1_000_000;

  const used = formatSIBytes(accountStats.disk.used_bytes);
  const usedPct = accountStats.disk.allocated_bytes
    ? (accountStats.disk.used_bytes / accountStats.disk.allocated_bytes) * 100
    : 0;
  const fragBytes =
    accountStats.disk.current_bytes > accountStats.disk.used_bytes
      ? accountStats.disk.current_bytes - accountStats.disk.used_bytes
      : 0;
  const frag = formatSIBytes(fragBytes);
  const fragPct = accountStats.disk.current_bytes
    ? (fragBytes / accountStats.disk.current_bytes) * 100
    : 0;

  return (
    <Card>
      <Flex direction="column" gap="7px">
        <CardHeader text="Disk" />
        <Flex>
          <Flex direction="column" gap="2">
            <Stat
              label="Used"
              value={`${used.value} ${used.unit}`}
              suffix={`${usedPct.toFixed(1)}%`}
              color="#6f77c0"
            />
            <Stat
              label="Fragmentation"
              value={`${frag.value} ${frag.unit}`}
              suffix={`${fragPct.toFixed(1)}%`}
              color="#E5484D"
            />
          </Flex>
          <DiskPieChart />
        </Flex>
        <Flex gap="6">
          <Flex direction="column" align="center" gap="1">
            <SpeedGauge
              valueMBs={readMBs}
              displayValue={`${readPerSec.value} ${readPerSec.unit}/s`}
              label="Read"
            />
            <Stat
              className={styles.perSecStat}
              value={Math.round(
                accountStats.io.read_ops_per_sec,
              ).toLocaleString()}
              suffix="r/s"
            />
          </Flex>
          <Flex direction="column" align="center" gap="1">
            <SpeedGauge
              valueMBs={writeMBs}
              displayValue={`${writePerSec.value} ${writePerSec.unit}/s`}
              label="Write"
            />
            <Stat
              className={styles.perSecStat}
              value={Math.round(
                accountStats.io.write_ops_per_sec,
              ).toLocaleString()}
              suffix="w/s"
            />
          </Flex>
        </Flex>
      </Flex>
    </Card>
  );
}

const TICK_INNER_R = R + SW / 2 + 1;
const TICK_OUTER_R = R + SW / 2 + 4;
const LABEL_R = R + SW / 2 + 11;

function SpeedGauge({
  valueMBs,
  displayValue,
  label,
}: {
  valueMBs: number;
  displayValue: string;
  label: string;
}) {
  const uid = useId();
  const gradId = `gauge-grad-${uid}`;

  const toRad = (d: number) => (d * Math.PI) / 180;
  const pt = (r: number, a: number): [number, number] => [
    CX + r * Math.sin(toRad(a)),
    CY - r * Math.cos(toRad(a)),
  ];
  const arcPath = (from: number, to: number): string => {
    if (to <= from) return "";
    const [sx, sy] = pt(R, from);
    const [ex, ey] = pt(R, to);
    return `M ${sx.toFixed(3)} ${sy.toFixed(3)} A ${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${ex.toFixed(3)} ${ey.toFixed(3)}`;
  };

  const [lx] = pt(R, GAUGE_START);
  const [rx] = pt(R, GAUGE_END);
  const fillEnd = valueToAngle(valueMBs);

  return (
    <svg viewBox="0 -14 115 86" style={{ width: 120, display: "block" }}>
      <defs>
        <linearGradient
          id={gradId}
          x1={lx}
          y1={CY}
          x2={rx}
          y2={CY}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={tileBusyRedColor} />
          <stop offset="100%" stopColor={tileBusyGreenColor} />
        </linearGradient>
      </defs>

      {/* Track */}
      <path
        d={arcPath(GAUGE_START, GAUGE_END)}
        fill="none"
        stroke="var(--gray-4)"
        strokeWidth={SW}
        strokeLinecap="round"
      />

      {/* Fill */}
      {valueMBs > 0 && (
        <path
          d={arcPath(GAUGE_START, fillEnd)}
          fill="none"
          // stroke={`url(#${gradId})`}
          stroke="#733b8e"
          strokeWidth={SW}
          strokeLinecap="round"
        />
      )}

      {/* Tick marks and increment labels */}
      {INCREMENTS.map((v, i) => {
        const angle = GAUGE_START + (i / NUM_SEGS) * GAUGE_SWEEP;
        const [x0, y0] = pt(TICK_INNER_R, angle);
        const [x1, y1] = pt(TICK_OUTER_R, angle);
        const [lbx, lby] = pt(LABEL_R, angle);
        const sinA = Math.sin(toRad(angle));
        const cosA = Math.cos(toRad(angle));
        const textAnchor =
          sinA < -0.2 ? "end" : sinA > 0.2 ? "start" : "middle";
        const dominantBaseline: "auto" | "hanging" | "middle" =
          cosA > 0.1 ? "auto" : cosA < -0.1 ? "hanging" : "middle";

        return (
          <g key={v}>
            <line
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke="var(--gray-7)"
              strokeWidth={0.8}
              strokeLinecap="round"
            />
            <text
              x={lbx}
              y={lby}
              textAnchor={textAnchor}
              dominantBaseline={dominantBaseline}
              style={{ fontSize: "7px", fill: "var(--gray-9)" }}
            >
              {v === 100 ? "100+" : v}
            </text>
          </g>
        );
      })}

      {/* Center value and label */}
      <text
        x={CX}
        y={CY - 10}
        textAnchor="middle"
        style={{ fontSize: "12px", fill: "var(--gray-9)" }}
      >
        {label}
      </text>
      <text
        x={CX}
        y={CY + 4}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fontSize: "12px", fill: "var(--gray-12)" }}
      >
        {displayValue}
      </text>
    </svg>
  );
}
