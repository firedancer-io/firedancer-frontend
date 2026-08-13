import { describe, expect, it } from "vitest";
import type { SystemLive } from "../../../../api/types";
import {
  getCpuGroups,
  getDiskSummary,
  getNumaNodeMemory,
  getNumaNodes,
} from "../utils";

type Memory = SystemLive["memory"];
type MemoryNode = Memory["nodes"][number];
type DiskMount = SystemLive["disk"][number];

describe("resource summaries", () => {
  it("summarizes per-node memory into resident, shared, other, and free", () => {
    const node: MemoryNode = {
      node: 0,
      total_bytes: 500,
      free_bytes: 100,
      shared_bytes: 20,
      tiles: [
        { tile_idx: 0, bytes: 80 },
        { tile_idx: 1, bytes: 50 },
      ],
    };

    expect(getNumaNodeMemory(node)).toEqual({
      totalBytes: 500,
      usedBytes: 400,
      firedancerBytes: 150,
      sharedBytes: 20,
      otherBytes: 250,
      freeBytes: 100,
      tiles: [
        { tileIdx: 0, bytes: 80 },
        { tileIdx: 1, bytes: 50 },
      ],
    });
  });

  it("clamps lagging per-node memory counters to valid bar geometry", () => {
    const memory = getNumaNodeMemory({
      node: 0,
      total_bytes: 100,
      free_bytes: 0,
      shared_bytes: 200,
      tiles: [{ tile_idx: 0, bytes: 50 }],
    });

    expect(memory).toEqual({
      totalBytes: 100,
      usedBytes: 100,
      firedancerBytes: 100,
      sharedBytes: 100,
      otherBytes: 0,
      freeBytes: 0,
      tiles: [{ tileIdx: 0, bytes: 50 }],
    });
  });

  it("joins CPU topology and memory into one descriptor per NUMA node", () => {
    const cpus: SystemLive["cpus"] = [
      { online: true, numa_node: 0, sibling_cpu: 2, tile_idxs: [0, 3] },
      { online: true, numa_node: 1, sibling_cpu: null, tile_idxs: [1] },
      { online: true, numa_node: 0, sibling_cpu: 0, tile_idxs: [] },
    ];
    const memory: Memory = {
      available_bytes: 300,
      free_bytes: 200,
      nodes: [
        {
          node: 0,
          total_bytes: 500,
          free_bytes: 100,
          shared_bytes: 20,
          tiles: [{ tile_idx: 0, bytes: 80 }],
        },
        {
          node: 1,
          total_bytes: 500,
          free_bytes: 100,
          shared_bytes: 10,
          tiles: [{ tile_idx: 1, bytes: 40 }],
        },
      ],
    };

    const nodes = getNumaNodes(cpus, memory);
    expect(nodes.map((n) => n.node)).toEqual([0, 1]);
    expect(nodes[0]).toMatchObject({
      node: 0,
      cpuIdxs: [0, 2],
      cpuGroups: [[0, 2]],
      pinned: 1,
      unpinned: 1,
      offline: 0,
      totalCpus: 2,
    });
    expect(nodes[0].memory?.firedancerBytes).toBe(100);
    expect(nodes[1]).toMatchObject({
      node: 1,
      cpuIdxs: [1],
      cpuGroups: [[1]],
      pinned: 1,
      unpinned: 0,
      offline: 0,
      totalCpus: 1,
    });
  });

  it("counts pinned, unpinned, and offline CPUs per node", () => {
    const cpus: SystemLive["cpus"] = [
      { online: true, numa_node: 0, sibling_cpu: null, tile_idxs: [0] },
      { online: true, numa_node: 0, sibling_cpu: null, tile_idxs: [] },
      { online: false, numa_node: 0, sibling_cpu: null, tile_idxs: [] },
      { online: false, numa_node: 0, sibling_cpu: null, tile_idxs: [1] },
    ];

    expect(getNumaNodes(cpus, undefined)[0]).toMatchObject({
      pinned: 1,
      unpinned: 1,
      offline: 2,
      totalCpus: 4,
    });
  });

  it("includes a node present in only one of cpus or memory", () => {
    const cpus: SystemLive["cpus"] = [
      { online: true, numa_node: 0, sibling_cpu: null, tile_idxs: [0] },
    ];
    const memory: Memory = {
      available_bytes: 100,
      free_bytes: 50,
      nodes: [
        {
          node: 1,
          total_bytes: 500,
          free_bytes: 100,
          shared_bytes: 0,
          tiles: [],
        },
      ],
    };

    const nodes = getNumaNodes(cpus, memory);
    expect(nodes.map((n) => n.node)).toEqual([0, 1]);
    expect(nodes[0].memory).toBeUndefined();
    expect(nodes[1].cpuIdxs).toEqual([]);
    expect(nodes[1].memory?.totalBytes).toBe(500);
  });

  it("returns no nodes when there is no data", () => {
    expect(getNumaNodes(undefined, undefined)).toEqual([]);
  });

  it("groups hyperthread siblings into one physical-core cell", () => {
    expect(
      getCpuGroups([
        { online: true, numa_node: 0, sibling_cpu: 2, tile_idxs: [] },
        { online: true, numa_node: 0, sibling_cpu: null, tile_idxs: [] },
        { online: true, numa_node: 0, sibling_cpu: 0, tile_idxs: [] },
      ]),
    ).toEqual([[0, 2], [1]]);
  });

  it("groups an offline sibling from the online CPU's reference", () => {
    expect(
      getCpuGroups([
        { online: false, numa_node: 0, sibling_cpu: null, tile_idxs: [] },
        { online: true, numa_node: 0, sibling_cpu: 0, tile_idxs: [0] },
      ]),
    ).toEqual([[0, 1]]);
  });

  it("scopes sibling grouping to a subset of logical CPUs", () => {
    const cpus: SystemLive["cpus"] = [
      { online: true, numa_node: 0, sibling_cpu: 2, tile_idxs: [] },
      { online: true, numa_node: 1, sibling_cpu: 3, tile_idxs: [] },
      { online: true, numa_node: 0, sibling_cpu: 0, tile_idxs: [] },
      { online: true, numa_node: 1, sibling_cpu: 1, tile_idxs: [] },
    ];
    expect(getCpuGroups(cpus, [0, 2])).toEqual([[0, 2]]);
    expect(getCpuGroups(cpus, [1, 3])).toEqual([[1, 3]]);
  });

  it("groups disk categories and computes non-Firedancer and free usage", () => {
    const mount: DiskMount = {
      name: "/data",
      total_bytes: 1000,
      used_bytes: 700,
      firedancer: [
        { category: "accounts", bytes: 200 },
        { category: "accounts", bytes: 100 },
        { category: "future-category", bytes: 50 },
      ],
    };
    const summary = getDiskSummary(mount);

    expect(summary).toMatchObject({
      totalBytes: 1000,
      usedBytes: 700,
      firedancerBytes: 350,
      nonFiredancerBytes: 350,
      freeBytes: 300,
    });
    expect(
      summary.firedancerSegments.map(({ label, bytes }) => ({ label, bytes })),
    ).toEqual([
      { label: "accounts", bytes: 300 },
      { label: "future-category", bytes: 50 },
    ]);
  });

  it("clamps lagging disk counters to valid bar geometry", () => {
    const disk = getDiskSummary({
      name: "/data",
      total_bytes: 100,
      used_bytes: 150,
      firedancer: [{ category: "accounts", bytes: 120 }],
    });
    expect(disk.usedBytes).toBe(100);
    expect(disk.firedancerSegments[0].bytes).toBe(100);
    expect(disk.firedancerBytes).toBe(100);
    expect(disk.nonFiredancerBytes).toBe(0);
    expect(disk.freeBytes).toBe(0);
  });
});
