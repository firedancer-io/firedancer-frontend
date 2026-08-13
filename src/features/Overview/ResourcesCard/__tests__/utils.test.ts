import { describe, expect, it } from "vitest";
import type { SystemLive } from "../../../../api/types";
import {
  formatResourceUsage,
  getCpuGroups,
  getCpuSummary,
  getDiskSummary,
  getMemorySummary,
} from "../utils";

type Memory = SystemLive["memory"];
type DiskMount = SystemLive["disk"][number];

describe("resource summaries", () => {
  it("formats Firedancer, used, and total resource values", () => {
    expect(formatResourceUsage(500_000_000, 2_000_000_000, 4_000_000_000)).toBe(
      "500.0 MB / 2.0 GB / 4.0 GB",
    );
  });

  it("uses a smaller unit instead of a fractional larger unit", () => {
    expect(
      formatResourceUsage(300_000_000_000, 700_000_000_000, 2_000_000_000_000),
    ).toBe("300.0 GB / 700.0 GB / 2.0 TB");
  });

  it("partitions host memory and includes shared and tile memory per NUMA node", () => {
    const memory: Memory = {
      available_bytes: 300,
      free_bytes: 200,
      nodes: [
        {
          node: 0,
          total_bytes: 500,
          free_bytes: 100,
          shared_bytes: 20,
          tiles: [
            { tile_idx: 0, bytes: 80 },
            { tile_idx: 1, bytes: 50 },
          ],
        },
        {
          node: 1,
          total_bytes: 500,
          free_bytes: 100,
          shared_bytes: 10,
          tiles: [{ tile_idx: 2, bytes: 40 }],
        },
      ],
    };

    expect(getMemorySummary(memory)).toEqual({
      totalBytes: 1000,
      usedBytes: 700,
      firedancerBytes: 200,
      sharedBytes: 30,
      otherBytes: 500,
      availableBytes: 300,
      tiles: [
        { tileIdx: 0, bytes: 80 },
        { tileIdx: 1, bytes: 50 },
        { tileIdx: 2, bytes: 40 },
      ],
      nodes: [
        { node: 0, bytes: 150 },
        { node: 1, bytes: 50 },
      ],
    });
  });

  it("counts only online CPUs with configured tiles as pinned", () => {
    expect(
      getCpuSummary([
        {
          online: true,
          numa_node: 0,
          sibling_cpu: 1,
          tile_idxs: [0, 3],
        },
        { online: true, numa_node: 0, sibling_cpu: 0, tile_idxs: [] },
        { online: false, numa_node: 1, sibling_cpu: null, tile_idxs: [2] },
      ]),
    ).toEqual({ total: 3, pinned: 1 });
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

  it("clamps lagging disk and memory counters to valid bar geometry", () => {
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

    const memory = getMemorySummary({
      available_bytes: 200,
      free_bytes: 0,
      nodes: [
        {
          node: 0,
          total_bytes: 100,
          free_bytes: 0,
          shared_bytes: 0,
          tiles: [],
        },
      ],
    });
    expect(memory).toMatchObject({
      totalBytes: 100,
      usedBytes: 0,
      availableBytes: 100,
      otherBytes: 0,
      sharedBytes: 0,
      tiles: [],
    });
  });
});
