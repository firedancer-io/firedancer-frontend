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
  name: string;
  description: string;
  headerColWidth: number;
  headerColAlign?: Table.ColumnHeaderCellProps["align"];
}

export const metrics: MetricDefinition[] = [
  {
    name: "Name",
    description:
      "The name and index of each tile. A tile represents a sandboxed process or individual thread that communicates with other tiles using message passing queues.",
    headerColWidth: 100,
  },
  {
    name: "Heartbeat",
    description:
      "Liveness indicator based on a periodic heartbeat timestamp written by tiles to a chunk of shared memory.",
    headerColWidth: 70,
  },
  {
    name: "Nivcsw",
    description:
      "The number of cumulative | immediate (10ms) involuntary context switches.",
    headerColWidth: 160,
    headerColAlign: "right",
  },
  {
    name: "Nvcsw",
    description:
      "The number of cumulative | immediate (10ms) voluntary context switches.",
    headerColWidth: 160,
    headerColAlign: "right",
  },
  {
    name: "Backp",
    description:
      "If a tile is backpressured, at least one outgoing message queue is at-capacity which can prevent the tile from moving forward with useful work.",
    headerColWidth: 70,
  },
  {
    name: "Backp Count",
    description:
      "The number of cumulative | immediate (10ms) times a CPU transitioned into a backpressured state.",
    headerColWidth: 160,
    headerColAlign: "right",
  },
  {
    name: "Utilization",
    description:
      "Visualized the percentage of the tile's CPU time spent doing useful work. Time spent in a context switch is not included.",
    headerColWidth: 200,
  },
  {
    name: "History (1m)",
    description: "A historical, low-pass-filtered view of CPU utilization.",
    headerColWidth: 200,
  },
  {
    name: "% Hkeep",
    description:
      "The percentage of cpu time spent on housekeeping tasks, which are meant to be infrequent and generally more expensive than tasks on the critical path.",
    headerColWidth: 80,
    headerColAlign: "right",
  },
  {
    name: "% Wait",
    description:
      "The percentage of CPU time spent waiting for useful work to do.",
    headerColWidth: 80,
    headerColAlign: "right",
  },
  {
    name: "% Backp",
    description:
      "The percentage of CPU time during which the tile was backpressured, excluding housekeeping time.",
    headerColWidth: 80,
    headerColAlign: "right",
  },
  {
    name: "% Work",
    description:
      "The percentage of CPU time spent performing useful work, excluding housekeeping and backpressured time.",
    headerColWidth: 80,
    headerColAlign: "right",
  },
];
