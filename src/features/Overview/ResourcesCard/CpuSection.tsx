import { type CSSProperties, memo, useLayoutEffect, useRef } from "react";
import clsx from "clsx";
import { clamp, isEqual, sortBy, sumBy } from "lodash";
import { Flex, Grid, Text } from "@radix-ui/themes";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { getDefaultStore, useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import {
  liveSystemResourcesAtom,
  liveTileMetricsAtom,
  tilesAtom,
  tileTimerAtom,
} from "../../../api/atoms";
import type { SystemLive } from "../../../api/types";
import { SectionHeading, SubHeading } from "./Headings";
import { LegendItem } from "./Legend";
import ResourceTooltip, {
  TooltipBody,
  TooltipRow,
  TooltipSeparator,
} from "./ResourceTooltip";
import { timerToPct } from "../LiveTileMetrics/utils";
import { getTileLabel, plural } from "./utils";
import legendStyles from "./legend.module.css";
import tileBusyStyles from "../../../components/tileBusy.module.css";
import styles from "./cpuSection.module.css";

const store = getDefaultStore();

type CpuStatus = "active" | "idle" | "offline";

type PhysicalCore = number[];

interface Die {
  dieIdx: number | null;
  cores: PhysicalCore[];
}

interface NumaNode {
  node: number;
  dies: Die[];
  numCores: number;
  numPinned: number;
  numOffline: number;
}

const liveCpusAtom = selectAtom(
  liveSystemResourcesAtom,
  (resources) => resources?.cpus ?? [],
  isEqual,
);

export default memo(function CpuSection() {
  const cpus = useAtomValue(liveCpusAtom);

  if (cpus.length === 0) return null;

  const nodes = getNumaNodes(cpus);
  const totalCores = sumBy(nodes, (node) => node.numCores);
  const totalPinned = sumBy(nodes, (node) => node.numPinned);
  const dieCount = sumBy(nodes, (node) => node.dies.length);
  const hasHyperthreading = cpus.some((cpu) => cpu.sibling_cpu != null);

  const topology = `${nodes.length} NUMA node${plural(nodes.length)}, ${dieCount} die${plural(dieCount)}`;
  const cpuCounts = `${totalCores} core${plural(totalCores)}, ${totalPinned} CPU${plural(totalPinned)} pinned`;

  return (
    <TooltipPrimitive.Provider delayDuration={120}>
      <Flex direction="column" gap="12px" minWidth="0">
        <SectionHeading label="CPU" value={`${topology}, ${cpuCounts}`} />
        {nodes.map((node) => (
          <Flex key={node.node} direction="column" minWidth="0" gap="8px">
            <SubHeading
              label={`NUMA ${node.node}`}
              value={`${node.numCores} core${plural(node.numCores)}, ${node.numPinned} CPU${plural(node.numPinned)} pinned, ${node.numOffline} offline`}
            />
            <Flex wrap="wrap" gapX="12px" gapY="8px">
              {node.dies.map((die) => (
                <DiePanel
                  key={String(die.dieIdx)}
                  die={die}
                  cpus={cpus}
                  hasHyperthreading={hasHyperthreading}
                />
              ))}
            </Flex>
          </Flex>
        ))}
        <CpuLegend />
      </Flex>
    </TooltipPrimitive.Provider>
  );
});

function DiePanel({
  die,
  cpus,
  hasHyperthreading,
}: {
  die: Die;
  cpus: SystemLive["cpus"];
  hasHyperthreading: boolean;
}) {
  const minColWidth = hasHyperthreading ? 72 : 36;

  return (
    <Flex
      className={styles.diePanel}
      direction="column"
      gap="8px"
      p="4px"
      flexGrow="1"
      flexBasis="225px"
    >
      <Text className={styles.dieLabel}>Die {die.dieIdx ?? "—"}</Text>
      <Grid
        columns={`repeat(auto-fit, minmax(${minColWidth}px, 1fr))`}
        gapX="8px"
        gapY="4px"
      >
        {die.cores.map((core) => (
          <PhysicalCpuCore key={core.join("-")} core={core} cpus={cpus} />
        ))}
      </Grid>
    </Flex>
  );
}

function PhysicalCpuCore({
  core,
  cpus,
}: {
  core: PhysicalCore;
  cpus: SystemLive["cpus"];
}) {
  return (
    <Flex minWidth="0" gap="2px">
      {core.map((cpuIdx) => (
        <CpuChip key={cpuIdx} cpuIdx={cpuIdx} cpus={cpus} />
      ))}
    </Flex>
  );
}

function CpuChip({
  cpuIdx,
  cpus,
}: {
  cpuIdx: number;
  cpus: SystemLive["cpus"];
}) {
  const status = getCpuStatus(cpus[cpuIdx]);
  const extraTiles = cpus[cpuIdx].tile_idxs.length - 1;

  const rectRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const tileIdxs = cpus[cpuIdx].tile_idxs;
    let shownTileIdx = -1;
    let lastUtil = -1;
    let shownPct: string | undefined;
    let shownLabel: string | undefined;

    const handleUpdate = () => {
      const timers = store.get(tileTimerAtom);

      let busiest = tileIdxs.includes(shownTileIdx) ? shownTileIdx : -1;
      let busiestUtil =
        busiest !== -1 ? timerToPct(timers?.[busiest]) : -Infinity;
      tileIdxs.forEach((idx) => {
        const util = timerToPct(timers?.[idx]);
        if (util > busiestUtil) {
          busiestUtil = util;
          busiest = idx;
        }
      });
      shownTileIdx = busiest;
      if (busiestUtil >= 0) lastUtil = busiestUtil;

      const pct = lastUtil >= 0 ? workPct(lastUtil) : "";
      if (rectRef.current && pct !== shownPct) {
        rectRef.current.style.setProperty("--pct", pct);
        shownPct = pct;
      }

      const label =
        busiest !== -1 ? getTileLabel(store.get(tilesAtom), busiest) : "";
      if (labelRef.current && label !== shownLabel) {
        labelRef.current.textContent = label;
        shownLabel = label;
      }
    };

    const unsubs = [
      store.sub(tileTimerAtom, handleUpdate),
      store.sub(tilesAtom, handleUpdate),
    ];
    handleUpdate();
    return () => unsubs.forEach((unsub) => unsub());
  }, [cpuIdx, cpus]);

  return (
    <ResourceTooltip
      disableHoverableContent
      content={<CpuTooltipContent cpuIdx={cpuIdx} cpus={cpus} />}
    >
      <Flex
        className={styles.cpuChip}
        direction="column"
        gap="2px"
        flexGrow="1"
        flexBasis="0"
        minWidth="0"
      >
        <Flex
          ref={rectRef}
          className={clsx(styles.cpu, {
            [`${tileBusyStyles.tileBusyColor} ${styles.cpuWork}`]:
              status === "active",
            [styles.cpuOffline]: status === "offline",
            [styles.cpuIdle]: status === "idle",
          })}
          height="12px"
          pr="2px"
          justify="end"
          align="center"
          overflow="hidden"
        >
          {extraTiles > 0 && (
            <span className={styles.cpuBadge}>+{extraTiles}</span>
          )}
        </Flex>
        <span ref={labelRef} className={styles.cpuCellLabel} />
      </Flex>
    </ResourceTooltip>
  );
}

function CpuTooltipContent({
  cpuIdx,
  cpus,
}: {
  cpuIdx: number;
  cpus: SystemLive["cpus"];
}) {
  const tiles = useAtomValue(tilesAtom);
  const timers = useAtomValue(tileTimerAtom);
  const metrics = useAtomValue(liveTileMetricsAtom);

  const {
    tile_idxs: tileIdxs,
    die_idx: dieIdx,
    sibling_cpu: siblingIdx,
  } = cpus[cpuIdx];
  const selfStatus = getCpuStatus(cpus[cpuIdx]);
  const busiestUtil = (idx: number) =>
    Math.max(-1, ...cpus[idx].tile_idxs.map((i) => timerToPct(timers?.[i])));

  return (
    <TooltipBody>
      <TooltipRow
        label="CPU"
        value={`${cpuIdx}${selfStatus === "active" ? "" : `, ${selfStatus}`}`}
      />
      {siblingIdx != null && cpus[siblingIdx] && (
        <TooltipRow
          label="Sibling CPU"
          value={`${siblingIdx}, ${getCpuStatus(cpus[siblingIdx])}`}
          icon={
            <CpuIcon
              status={getCpuStatus(cpus[siblingIdx])}
              util={busiestUtil(siblingIdx)}
            />
          }
        />
      )}
      <TooltipRow label="Die" value={dieIdx ?? "—"} />
      <TooltipRow label="NUMA node" value={cpus[cpuIdx].numa_node} />
      {tileIdxs.length > 0 && <TooltipSeparator />}
      {tileIdxs.map((idx) => {
        const work = timerToPct(timers?.[idx]);
        const priority = metrics?.priority?.[idx];
        const tag =
          priority === "startup" || priority === "floating"
            ? `, ${priority}`
            : "";
        return (
          <TooltipRow
            key={idx}
            label={getTileLabel(tiles, idx)}
            value={`${work >= 0 ? `${Math.round(work * 100)}% work` : "No data"}${tag}`}
            icon={<CpuIcon status="active" util={work} />}
          />
        );
      })}
    </TooltipBody>
  );
}

function CpuIcon({ status, util }: { status: CpuStatus; util: number }) {
  return (
    <span
      className={clsx(styles.cpuIcon, {
        [`${tileBusyStyles.tileBusyColor} ${styles.cpuWork}`]:
          status === "active",
        [styles.cpuIdle]: status === "idle",
        [styles.cpuOffline]: status === "offline",
      })}
      style={
        status === "active" && util >= 0
          ? ({ "--pct": workPct(util) } as CSSProperties)
          : undefined
      }
    />
  );
}

function CpuLegend() {
  return (
    <Flex gap="10px" wrap="wrap" align="center">
      <Flex align="center" gap="4px" className={legendStyles.legendItemKey}>
        <Text>0%</Text>
        <span className={styles.cpuWorkGradient} />
        <Text>100% work</Text>
      </Flex>
      <LegendItem label="Idle" icon={<CpuIcon status="idle" util={0} />} />
      <LegendItem
        label="Offline"
        icon={<CpuIcon status="offline" util={0} />}
      />
      <Text className={legendStyles.legendItemKey}>
        +N = more tiles share that CPU
      </Text>
    </Flex>
  );
}

function workPct(util: number): string {
  return `${Math.round(clamp(util, 0, 1) * 100)}%`;
}

function getCpuStatus(cpu: SystemLive["cpus"][number]): CpuStatus {
  if (!cpu.online) return "offline";
  return cpu.tile_idxs.length ? "active" : "idle";
}

/**
 * CPU topology as NUMA node → die → physical core → logical CPU:
 *
 * ┌─ NUMA node 0 ───────────────────────────────────────┐
 * │ ┌─ Die 0 ─────────────────┐ ┌─ Die 1 ─────────────┐ │
 * │ │ ┌─ Core ──┐ ┌─ Core ──┐ │ │ ┌─ Core ──┐         │ │
 * │ │ │ CPU 0   │ │ CPU 1   │ │ │ │ CPU 4   │   ...   │ │
 * │ │ │ CPU 2   │ │ CPU 3   │ │ │ │ CPU 6   │         │ │
 * │ │ └─────────┘ └─────────┘ │ │ └─────────┘         │ │
 * │ └─────────────────────────┘ └─────────────────────┘ │
 * └─────────────────────────────────────────────────────┘
 *
 * A physical core holds one logical CPU, or two hyperthread siblings.
 */
function getNumaNodes(cpus: SystemLive["cpus"]): NumaNode[] {
  const cpuMap = new Map<number, Map<number | null, PhysicalCore>>();
  cpus.forEach((cpu, idx) => {
    let dies = cpuMap.get(cpu.numa_node);
    if (!dies) {
      dies = new Map();
      cpuMap.set(cpu.numa_node, dies);
    }

    let dieCpuIdxs = dies.get(cpu.die_idx);
    if (!dieCpuIdxs) {
      dieCpuIdxs = [];
      dies.set(cpu.die_idx, dieCpuIdxs);
    }

    dieCpuIdxs.push(idx);
  });

  const sortedNodes = sortBy([...cpuMap], ([node]) => node);
  return sortedNodes.map(([node, cpuIdxsByDie]) => {
    const sortedDies = sortBy(
      [...cpuIdxsByDie],
      ([dieIdx]) => dieIdx ?? Infinity,
    );

    const dies = sortedDies.map(([dieIdx, dieCpuIdxs]) => {
      const cores = dieCpuIdxs.flatMap((idx): PhysicalCore[] => {
        const siblingIdx = cpus[idx].sibling_cpu;
        if (siblingIdx == null || cpus[siblingIdx]?.sibling_cpu !== idx)
          return [[idx]];
        return idx < siblingIdx ? [[idx, siblingIdx]] : [];
      });
      return { dieIdx, cores };
    });

    const nodeCpus = [...cpuIdxsByDie.values()].flatMap((dieCpuIdxs) =>
      dieCpuIdxs.map((idx) => cpus[idx]),
    );

    const countStatus = (status: CpuStatus) =>
      nodeCpus.filter((cpu) => getCpuStatus(cpu) === status).length;

    return {
      node,
      dies,
      numCores: sumBy(dies, (die) => die.cores.length),
      numPinned: countStatus("active"),
      numOffline: countStatus("offline"),
    };
  });
}
