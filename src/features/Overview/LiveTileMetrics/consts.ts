import type { Table } from "@radix-ui/themes";

/** Tile regimes are the cartesian product of the following two state vectors:
    State vector 1:
    running: means that at the time the run loop executed, there was no upstream message I/O for the tile to handle.
    processing: means that at the time the run loop executed, there was one or more messages for the tile to consume.
    stalled: means that at the time the run loop executed, a downstream consumer of the messages produced by this tile is slow or stalled, and the message link for that consumer has filled up. This state causes the tile to stop processing upstream messages.
    
    State Vector 2:
    maintenance: the portion of the run loop that executes infrequent, potentially CPU heavy tasks
    routine: the portion of the run loop that executes regularly, regardless of the presence of incoming messages
    handling: the portion of the run loop that executes as a side effect of an incoming message from an upstream producer tile
 */
export const regimes = [
  "running_maintenance",
  "processing_maintenance",
  "stalled_maintenance",
  "running_routine",
  "processing_routine",
  "stalled_routine",
  "running_handling",
  "processing_handling",
  // "stalled_handling" is an impossible state, and is therefore excluded
];

interface MetricDefinition {
  uniqueName: string;
  columnName?: string;
  description: string;
  headerColWidth: number;
  headerColAlign?: Table.ColumnHeaderCellProps["align"];
  wrap?: boolean;
}

export const metricGroups: {
  name: string;
  pinned?: boolean;
  metrics: MetricDefinition[];
}[] = [
  {
    name: "",
    pinned: true,
    metrics: [
      {
        uniqueName: "Name",
        description:
          "The name and index of each tile. A tile represents a sandboxed process or individual thread that communicates with other tiles using message passing queues.",
        headerColWidth: 70,
      },
    ],
  },
  {
    name: "Liveness",
    metrics: [
      {
        uniqueName: "CPU",
        description:
          "The CPU index on which the tile was last recorded executing.",
        headerColWidth: 70,
        headerColAlign: "right",
      },
      {
        uniqueName: "Heartbeat",
        description:
          "Liveness indicator based on a periodic heartbeat timestamp written by tiles to a chunk of shared memory.",
        headerColWidth: 70,
        headerColAlign: "right",
      },
      {
        uniqueName: "Minflt",
        description:
          "The number of cumulative minor page faults. Minor page faults occur for pages in RAM not indexed by the page table.",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "Majflt",
        description:
          "The number of cumulative major page faults. Major page faults occur for pages that are neither in RAM nor the page table.",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "Nivcsw",
        description:
          "The number of cumulative | immediate (10ms) involuntary context switches.",
        headerColWidth: 160,
        headerColAlign: "right",
      },
      {
        uniqueName: "Nvcsw",
        description:
          "The number of cumulative | immediate (10ms) voluntary context switches.",
        headerColWidth: 160,
        headerColAlign: "right",
      },
      {
        uniqueName: "Backp",
        description:
          "If a tile is backpressured, at least one outgoing message queue is at-capacity which can prevent the tile from moving forward with useful work.",
        headerColWidth: 70,
        headerColAlign: "right",
      },
    ],
  },
  {
    name: "Utilization",
    metrics: [
      {
        uniqueName: "Backp Count",
        description:
          "The number of cumulative | immediate (10ms) times a CPU transitioned into a backpressured state.",
        headerColWidth: 160,
        headerColAlign: "right",
      },
      {
        uniqueName: "Utilization",
        description:
          "Visualized the percentage of the tile's CPU time spent doing useful work. Time spent in a context switch is not included.",
        headerColWidth: 200,
      },
      {
        uniqueName: "History (1m)",
        description: "A historical, low-pass-filtered view of CPU utilization.",
        headerColWidth: 200,
      },
    ],
  },
  {
    name: "System",
    metrics: [
      {
        uniqueName: "% Hkeep",
        description:
          "The percentage of CPU time spent on housekeeping tasks, which are meant to be infrequent and generally more expensive than tasks on the critical path.",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "% Wait",
        description:
          "The percentage of CPU time spent waiting for useful work to do.",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "% Backp",
        description:
          "The percentage of CPU time during which the tile was backpressured, excluding housekeeping time.",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "% Work",
        description:
          "The percentage of CPU time spent performing useful work, excluding housekeeping and backpressured time.",
        headerColWidth: 80,
        headerColAlign: "right",
      },
    ],
  },
  {
    name: "Scheduler",
    metrics: [
      {
        uniqueName: "% Wait (scheduler)",
        columnName: "% Wait",
        description:
          "The percentage of CPU time spent waiting in the runqueue before being dispatched.",
        headerColWidth: 80,
        headerColAlign: "right",
        wrap: true,
      },
      {
        uniqueName: "% User (scheduler)",
        columnName: "% User",
        description: "The percentage of CPU time spent executing in user mode.",
        headerColWidth: 80,
        headerColAlign: "right",
        wrap: true,
      },
      {
        uniqueName: "% System (scheduler)",
        columnName: "% System",
        description:
          "The percentage of CPU time spent executing in kernel mode.",
        headerColWidth: 80,
        headerColAlign: "right",
        wrap: true,
      },
      {
        uniqueName: "% Idle (scheduler)",
        columnName: "% Idle",
        description:
          "The percentage of CPU time unaccounted for by the other 3 regimes.",
        headerColWidth: 80,
        headerColAlign: "right",
        wrap: true,
      },
    ],
  },
];

export const pinnedGroups = metricGroups.filter(({ pinned }) => pinned);
export const unpinnedGroups = metricGroups.filter(({ pinned }) => !pinned);

// start with one pixel to account for border width
export const pinnedTableWidth = pinnedGroups.reduce((acc, group) => {
  for (const metric of group.metrics) {
    acc += metric.headerColWidth;
  }
  return acc;
}, 1);
