import type { SystemLive } from "../../../api/types";

export interface ResourceSegment {
  key: string;
  label: string;
  bytes: number;
  color: string;
  /** Set for per-tile segments so the bar can drive tile cross-highlighting. */
  tileIdx?: number;
}

export const resourceColors = {
  firedancer: "var(--blue-8)",
  shared: "var(--gray-8)",
  other: "var(--gray-7)",
  available: "var(--gray-4)",
  accounts: "var(--teal-8)",
  shreds: "var(--yellow-8)",
  snapshots: "var(--indigo-8)",
  gui: "var(--purple-8)",
  logs: "var(--red-8)",
  unknown: "var(--gray-8)",
} as const;

const diskCategoryColors: Record<string, string> = {
  accounts: resourceColors.accounts,
  shreds: resourceColors.shreds,
  snapshots: resourceColors.snapshots,
  gui: resourceColors.gui,
  logs: resourceColors.logs,
};

// Radix accent tokens, aligned with the accounts cache-class palette, cycled by
// tile index so per-tile colors read as part of the app-wide scheme. Excludes
// blue (reserved for the Firedancer overview segment) and gray (Shared/Other).
const tileColors = [
  "var(--indigo-8)",
  "var(--cyan-8)",
  "var(--teal-8)",
  "var(--lime-8)",
  "var(--yellow-8)",
  "var(--brown-8)",
  "var(--red-8)",
  "var(--purple-8)",
  "var(--orange-8)",
  "var(--pink-8)",
  "var(--grass-8)",
  "var(--crimson-8)",
] as const;

const nonNegative = (value: number) => Math.max(value, 0);

/** Stable per-tile color, shared between the CPU grid and the memory bar. */
export function getTileColor(tileIdx: number) {
  return tileColors[tileIdx % tileColors.length];
}

export interface NumaNodeMemory {
  totalBytes: number;
  usedBytes: number;
  firedancerBytes: number;
  sharedBytes: number;
  otherBytes: number;
  freeBytes: number;
  tiles: { tileIdx: number; bytes: number }[];
}

export interface NumaNode {
  node: number;
  cpuIdxs: number[];
  cpuGroups: number[][];
  pinned: number;
  unpinned: number;
  offline: number;
  totalCpus: number;
  memory?: NumaNodeMemory;
}

/**
 * Joins CPU topology and per-node memory into one descriptor per NUMA node.
 * A node is included if it appears in either `cpus` or `memory.nodes`, so a
 * mismatch between the two sources still renders from whichever side has data.
 */
export function getNumaNodes(
  cpus: SystemLive["cpus"] | undefined,
  memory: SystemLive["memory"] | undefined,
): NumaNode[] {
  const nodeIds = new Set<number>();
  cpus?.forEach((cpu) => nodeIds.add(cpu.numa_node));
  memory?.nodes.forEach((node) => nodeIds.add(node.node));

  const memoryByNode = new Map(
    memory?.nodes.map((node) => [node.node, node]) ?? [],
  );

  return Array.from(nodeIds)
    .sort((a, b) => a - b)
    .map((nodeId) => {
      const cpuIdxs: number[] = [];
      cpus?.forEach((cpu, cpuIdx) => {
        if (cpu.numa_node === nodeId) cpuIdxs.push(cpuIdx);
      });
      const memoryNode = memoryByNode.get(nodeId);

      const pinned = cpuIdxs.filter(
        (idx) => cpus?.[idx].online && cpus[idx].tile_idxs.length > 0,
      ).length;
      const offline = cpuIdxs.filter((idx) => !cpus?.[idx].online).length;

      return {
        node: nodeId,
        cpuIdxs,
        cpuGroups: cpus ? getCpuGroups(cpus, cpuIdxs) : [],
        pinned,
        unpinned: cpuIdxs.length - pinned - offline,
        offline,
        totalCpus: cpuIdxs.length,
        memory: memoryNode ? getNumaNodeMemory(memoryNode) : undefined,
      };
    });
}

export function getNumaNodeMemory(
  node: SystemLive["memory"]["nodes"][number],
): NumaNodeMemory {
  const totalBytes = nonNegative(node.total_bytes);
  const freeBytes = Math.min(nonNegative(node.free_bytes), totalBytes);
  const usedBytes = nonNegative(totalBytes - freeBytes);
  const sharedBytes = nonNegative(node.shared_bytes);
  const tiles = node.tiles.map((tile) => ({
    tileIdx: tile.tile_idx,
    bytes: nonNegative(tile.bytes),
  }));
  const residentBytes =
    sharedBytes + tiles.reduce((sum, tile) => sum + tile.bytes, 0);
  const firedancerBytes = Math.min(residentBytes, usedBytes);

  return {
    totalBytes,
    usedBytes,
    firedancerBytes,
    sharedBytes: Math.min(sharedBytes, usedBytes),
    otherBytes: nonNegative(usedBytes - firedancerBytes),
    freeBytes,
    tiles,
  };
}

/**
 * Pairs hyperthread siblings into physical-core cells. When `cpuIdxs` is given,
 * only those logical CPUs are grouped (used to scope grouping to one NUMA node);
 * siblings never straddle nodes, so this stays correct.
 */
export function getCpuGroups(cpus: SystemLive["cpus"], cpuIdxs?: number[]) {
  const grouped = new Set<number>();
  const groups: number[][] = [];
  const order = cpuIdxs ?? cpus.map((_, idx) => idx);

  order.forEach((cpuIdx) => {
    const cpu = cpus[cpuIdx];
    if (grouped.has(cpuIdx)) return;

    const referencedBy = cpus.findIndex(
      (candidate) => candidate.sibling_cpu === cpuIdx,
    );
    const siblingIdx = cpu.sibling_cpu ?? referencedBy;
    const hasValidSibling =
      siblingIdx !== -1 &&
      siblingIdx !== cpuIdx &&
      siblingIdx >= 0 &&
      siblingIdx < cpus.length &&
      !grouped.has(siblingIdx);
    const group = hasValidSibling
      ? [Math.min(cpuIdx, siblingIdx), Math.max(cpuIdx, siblingIdx)]
      : [cpuIdx];

    group.forEach((idx) => grouped.add(idx));
    groups.push(group);
  });

  return groups;
}

export interface DiskSummary {
  totalBytes: number;
  usedBytes: number;
  firedancerBytes: number;
  nonFiredancerBytes: number;
  freeBytes: number;
  firedancerSegments: ResourceSegment[];
}

export function getDiskSummary(mount: SystemLive["disk"][number]): DiskSummary {
  const totalBytes = nonNegative(mount.total_bytes);
  const usedBytes = Math.min(nonNegative(mount.used_bytes), totalBytes);
  const grouped = new Map<string, number>();

  for (const usage of mount.files) {
    grouped.set(
      usage.category,
      (grouped.get(usage.category) ?? 0) + nonNegative(usage.bytes),
    );
  }

  let remainingUsed = usedBytes;
  const firedancerSegments: ResourceSegment[] = [];
  for (const [category, bytes] of grouped) {
    const renderedBytes = Math.min(bytes, remainingUsed);
    remainingUsed -= renderedBytes;
    firedancerSegments.push({
      key: category,
      label: category,
      bytes: renderedBytes,
      color: diskCategoryColors[category] ?? resourceColors.unknown,
    });
  }

  const reportedFiredancerBytes = Array.from(grouped.values()).reduce(
    (total, bytes) => total + bytes,
    0,
  );

  return {
    totalBytes,
    usedBytes,
    firedancerBytes: Math.min(reportedFiredancerBytes, usedBytes),
    nonFiredancerBytes: remainingUsed,
    freeBytes: nonNegative(totalBytes - usedBytes),
    firedancerSegments,
  };
}
