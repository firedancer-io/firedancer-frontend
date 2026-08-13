import type { SystemLive } from "../../../api/types";
import { formatSIBytes } from "../../../utils";

export interface ResourceSegment {
  key: string;
  label: string;
  bytes: number;
  color: string;
}

export const resourceColors = {
  firedancer: "#2DA9D7",
  other: "#765A62",
  available: "#303134",
  accounts: "#459D69",
  shreds: "#C88C32",
  snapshots: "#459D69",
  gui: "#786AC6",
  logs: "#A563B5",
  unknown: "#60798B",
} as const;

const diskCategoryColors: Record<string, string> = {
  accounts: resourceColors.accounts,
  shreds: resourceColors.shreds,
  snapshots: resourceColors.snapshots,
  gui: resourceColors.gui,
  logs: resourceColors.logs,
};

const nonNegative = (value: number) => Math.max(value, 0);

export function formatResourceUsage(
  firedancerBytes: number,
  usedBytes: number,
  totalBytes: number,
) {
  return [firedancerBytes, usedBytes, totalBytes]
    .map((bytes) => {
      const formatted = formatSIBytes(bytes);
      return `${formatted.value} ${formatted.unit}`;
    })
    .join(" / ");
}

export function getMemorySummary(memory: SystemLive["memory"]) {
  const tiles = new Map<number, number>();
  let sharedBytes = 0;
  for (const node of memory.nodes) {
    sharedBytes += nonNegative(node.shared_bytes);
    for (const tile of node.tiles) {
      tiles.set(
        tile.tile_idx,
        (tiles.get(tile.tile_idx) ?? 0) + nonNegative(tile.bytes),
      );
    }
  }

  const totalBytes = memory.nodes.reduce(
    (total, node) => total + nonNegative(node.total_bytes),
    0,
  );
  const tileBytes = Array.from(tiles.values()).reduce(
    (total, bytes) => total + bytes,
    0,
  );
  const firedancerBytes = sharedBytes + tileBytes;
  const availableBytes = Math.min(
    nonNegative(memory.available_bytes),
    totalBytes,
  );
  const usedBytes = nonNegative(totalBytes - availableBytes);
  const firedancerBarBytes = Math.min(firedancerBytes, usedBytes);
  const otherBytes = nonNegative(usedBytes - firedancerBarBytes);

  return {
    totalBytes,
    usedBytes,
    firedancerBytes,
    sharedBytes: Math.min(sharedBytes, usedBytes),
    otherBytes,
    availableBytes,
    tiles: Array.from(tiles, ([tileIdx, bytes]) => ({ tileIdx, bytes })),
    nodes: memory.nodes.map((node) => ({
      node: node.node,
      bytes:
        nonNegative(node.shared_bytes) +
        node.tiles.reduce((sum, tile) => sum + nonNegative(tile.bytes), 0),
    })),
  };
}

export function getCpuSummary(cpus: SystemLive["cpus"]) {
  return {
    total: cpus.length,
    pinned: cpus.filter((cpu) => cpu.online && cpu.tile_idxs.length > 0).length,
  };
}

export function getCpuGroups(cpus: SystemLive["cpus"]) {
  const grouped = new Set<number>();
  const groups: number[][] = [];

  cpus.forEach((cpu, cpuIdx) => {
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

export function getDiskSummary(mount: SystemLive["disk"][number]) {
  const totalBytes = nonNegative(mount.total_bytes);
  const usedBytes = Math.min(nonNegative(mount.used_bytes), totalBytes);
  const grouped = new Map<string, number>();

  for (const usage of mount.firedancer) {
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
