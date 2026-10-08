import { useLayoutEffect, useRef } from "react";
import { Flex, Separator, Text, Tooltip } from "@radix-ui/themes";
import clsx from "clsx";
import MonoText from "../../../components/MonoText";
import { getDefaultStore, useAtomValue } from "jotai";
import { liveTileMetricsAtom, tileTimerAtom } from "../../../api/atoms";
import type { SystemLive, Tile } from "../../../api/types";
import SectionHeading from "./SectionHeading";
import {
  busyRampColor,
  countDies,
  getCpuGroups,
  getDieGroups,
  getNumaNodes,
  getSiblingCpu,
  tileUtilPct,
} from "./utils";
import styles from "./resourcesCard.module.css";

const store = getDefaultStore();

const plural = (n: number) => (n === 1 ? "" : "s");

const tileLabelOf = (tiles: Tile[] | undefined, idx: number) => {
  const tile = tiles?.[idx];
  return tile ? `${tile.kind}.${tile.kind_id}` : `tile ${idx}`;
};

interface CpuSectionProps {
  cpus?: SystemLive["cpus"];
  tiles?: Tile[];
}

export default function CpuSection({ cpus, tiles }: CpuSectionProps) {
  if (!cpus || cpus.length === 0) {
    return (
      <Flex direction="column" gap="2" minWidth="0">
        <SectionHeading label="CPU" value="—" />
        <div className={styles.cpuGridPlaceholder} />
      </Flex>
    );
  }

  const nodes = getNumaNodes(cpus, undefined);
  const dieCount = countDies(cpus);
  const totalCores = nodes.reduce(
    (sum, node) => sum + getCpuGroups(cpus, node.cpuIdxs).length,
    0,
  );
  const totalPinned = nodes.reduce((sum, node) => sum + node.pinned, 0);

  const topology = `${nodes.length} NUMA node${plural(nodes.length)}, ${dieCount} die${plural(dieCount)}`;
  const cpuCounts = `${totalCores} cores, ${totalPinned} CPUs pinned`;

  return (
    <Flex direction="column" gap="3" minWidth="0">
      <SectionHeading
        label="CPU"
        value={
          <Flex gap="4">
            <span>{topology}</span>
            <span>{cpuCounts}</span>
          </Flex>
        }
      />
      {nodes.map((node) => {
        const dies = getDieGroups(cpus, node.cpuIdxs);
        const cores = dies.reduce((sum, die) => sum + die.cpuGroups.length, 0);
        return (
          <Flex key={node.node} direction="column" gap="2" minWidth="0">
            <div className={styles.numaSubhead}>
              <Text className={styles.numaLabel}>NUMA {node.node}</Text>
              <Text className={styles.sectionValue}>
                {cores} cores, {node.pinned} pinned, {node.offline} offline
              </Text>
            </div>
            <div className={styles.dieGrid}>
              {dies.map((die) => (
                <DiePanel
                  key={String(die.dieIdx)}
                  dieIdx={die.dieIdx}
                  cpuGroups={die.cpuGroups}
                  cpus={cpus}
                  tiles={tiles}
                />
              ))}
            </div>
          </Flex>
        );
      })}
      <CpuLegend />
    </Flex>
  );
}

function DiePanel({
  dieIdx,
  cpuGroups,
  cpus,
  tiles,
}: {
  dieIdx: number | null;
  cpuGroups: number[][];
  cpus: SystemLive["cpus"];
  tiles?: Tile[];
}) {
  return (
    <div className={styles.diePanel}>
      <Text className={styles.dieLabel}>Die {dieIdx ?? "—"}</Text>
      <div className={styles.cpuGrid}>
        {cpuGroups.map((group) => (
          <CpuCell
            key={group.join("-")}
            group={group}
            cpus={cpus}
            tiles={tiles}
            dieIdx={dieIdx}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One physical core = a sibling pair, rendered as two individual chips side by
 * side. Each chip is its own hover target with its own tooltip, so siblings show
 * independent info.
 */
function CpuCell({
  group,
  cpus,
  tiles,
  dieIdx,
}: {
  group: number[];
  cpus: SystemLive["cpus"];
  tiles?: Tile[];
  dieIdx: number | null;
}) {
  return (
    <div className={styles.coreGroup}>
      {group.map((cpuIdx) => (
        <CpuChip
          key={cpuIdx}
          cpuIdx={cpuIdx}
          siblingIdx={getSiblingCpu(cpus, cpuIdx)}
          cpus={cpus}
          tiles={tiles}
          dieIdx={dieIdx}
        />
      ))}
    </div>
  );
}

/**
 * A single logical CPU: colored and labeled from the tiles pinned to *this* CPU
 * (siblings never share a color), with its own tooltip. The sibling is referenced
 * by id + status only.
 */
function CpuChip({
  cpuIdx,
  siblingIdx,
  cpus,
  tiles,
  dieIdx,
}: {
  cpuIdx: number;
  siblingIdx: number | null;
  cpus: SystemLive["cpus"];
  tiles?: Tile[];
  dieIdx: number | null;
}) {
  const online = cpus[cpuIdx].online;
  const tileIdxs = cpus[cpuIdx].tile_idxs;

  const rectRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  // The tile currently shown in the label. Kept sticky so ties (e.g. a sibling
  // startup tile idling at 0%) don't flip the label back and forth.
  const shownTileRef = useRef(-1);

  // Recolor + rewrite label/badge imperatively on every utilization tick, so the
  // per-frame tileTimerAtom updates never re-render the grid.
  useLayoutEffect(() => {
    const update = () => {
      const timers = store.get(tileTimerAtom);
      const offline = !online;
      const hasTiles = tileIdxs.length > 0;

      // Seed with the currently shown tile so another tile only takes over when
      // it's *strictly* busier; equal utilization keeps the current label.
      let busiest = tileIdxs.includes(shownTileRef.current)
        ? shownTileRef.current
        : -1;
      let busiestUtil =
        busiest >= 0 ? tileUtilPct(timers?.[busiest]) : -Infinity;
      tileIdxs.forEach((idx) => {
        const util = tileUtilPct(timers?.[idx]);
        if (util > busiestUtil) {
          busiestUtil = util;
          busiest = idx;
        }
      });
      shownTileRef.current = busiest;

      const rect = rectRef.current;
      if (rect) {
        rect.classList.toggle(styles.cpuOffline, offline);
        rect.classList.toggle(styles.cpuIdle, !offline && !hasTiles);
        rect.style.background =
          !offline && hasTiles ? busyRampColor(busiestUtil) : "";
      }
      if (labelRef.current) {
        labelRef.current.textContent =
          busiest >= 0 ? tileLabelOf(tiles, busiest) : "";
      }
      if (badgeRef.current) {
        const extra = tileIdxs.length - 1;
        badgeRef.current.textContent = extra > 0 ? `+${extra}` : "";
        badgeRef.current.classList.toggle(styles.hidden, extra <= 0);
      }
    };

    const unsub = store.sub(tileTimerAtom, update);
    update();
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpus, tiles, cpuIdx]);

  return (
    <Tooltip
      className={styles.resourceTooltip}
      delayDuration={120}
      disableHoverableContent
      content={
        <CpuTooltipContent
          cpuIdx={cpuIdx}
          siblingIdx={siblingIdx}
          cpus={cpus}
          tiles={tiles}
          dieIdx={dieIdx}
        />
      }
    >
      <div
        className={styles.cpuChip}
        data-tile-interactive={tileIdxs.length > 0 ? "" : undefined}
      >
        <div className={styles.cpu} ref={rectRef}>
          <span
            ref={badgeRef}
            className={clsx(styles.cpuBadge, styles.hidden)}
          />
        </div>
        <span ref={labelRef} className={styles.cpuCellLabel} />
      </div>
    </Tooltip>
  );
}

/**
 * Tooltip body for one logical CPU. Mounted only while the tooltip is open, and
 * subscribes to the live atoms (via useAtomValue) so the util values keep
 * updating while hovered.
 */
function CpuTooltipContent({
  cpuIdx,
  siblingIdx,
  cpus,
  tiles,
  dieIdx,
}: {
  cpuIdx: number;
  siblingIdx: number | null;
  cpus: SystemLive["cpus"];
  tiles?: Tile[];
  dieIdx: number | null;
}) {
  const timers = useAtomValue(tileTimerAtom);
  const metrics = useAtomValue(liveTileMetricsAtom);

  const tileIdxs = cpus[cpuIdx].tile_idxs;
  const numaNode = cpus[cpuIdx].numa_node;
  const statusWord = (idx: number) => {
    const c = cpus[idx];
    return !c.online ? "offline" : c.tile_idxs.length ? "active" : "idle";
  };
  const selfStatus = statusWord(cpuIdx);

  return (
    <Flex direction="column" gap="1" className={styles.cpuTooltip}>
      <Flex justify="between" gap="4" align="center">
        <Text className={styles.tooltipLabel}>CPU</Text>
        <MonoText className={styles.tooltipValue}>
          {cpuIdx}
          {selfStatus === "active" ? "" : `, ${selfStatus}`}
        </MonoText>
      </Flex>
      {siblingIdx != null && (
        <Flex justify="between" gap="4">
          <Text className={styles.tooltipLabel}>Sibling CPU</Text>
          <MonoText className={styles.tooltipValue}>
            {siblingIdx}, {statusWord(siblingIdx)}
          </MonoText>
        </Flex>
      )}
      <Flex justify="between" gap="4">
        <Text className={styles.tooltipLabel}>Die</Text>
        <MonoText className={styles.tooltipValue}>{dieIdx ?? "—"}</MonoText>
      </Flex>
      <Flex justify="between" gap="4">
        <Text className={styles.tooltipLabel}>NUMA node</Text>
        <MonoText className={styles.tooltipValue}>{numaNode}</MonoText>
      </Flex>
      {tileIdxs.length > 0 && (
        <Separator size="4" my="1" className={styles.tooltipSeparator} />
      )}
      {tileIdxs.map((idx) => {
        const work = tileUtilPct(timers?.[idx]);
        const priority = metrics?.priority?.[idx];
        const tag =
          priority === "startup" || priority === "floating"
            ? `, ${priority}`
            : "";
        return (
          <Flex key={idx} justify="between" gap="4" align="center">
            <Text className={styles.tooltipLabel}>
              {tileLabelOf(tiles, idx)}
            </Text>
            <MonoText className={styles.tooltipValue}>
              {Math.round(work)}% work{tag}
            </MonoText>
          </Flex>
        );
      })}
    </Flex>
  );
}

function CpuLegend() {
  return (
    <Flex gap="12px" wrap="wrap" align="center">
      <Flex align="center" gap="1" className={styles.legendKeyItem}>
        <Text>0%</Text>
        <span className={styles.cpuKeyGradient} />
        <Text>100% work</Text>
      </Flex>
      <Flex align="center" gap="1" className={styles.legendKeyItem}>
        <span className={clsx(styles.legendKeySwatch, styles.cpuKeyIdle)} />
        <Text>Idle</Text>
      </Flex>
      <Flex align="center" gap="1" className={styles.legendKeyItem}>
        <span className={clsx(styles.legendKeySwatch, styles.cpuKeyOffline)} />
        <Text>Offline</Text>
      </Flex>
      <Text className={styles.legendKeyItem}>
        +N = more tiles share that CPU
      </Text>
    </Flex>
  );
}
