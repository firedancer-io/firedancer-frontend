import type { ColumnGroup } from "../../../components/DataTable";

export const partitionGroups: ColumnGroup[] = [
  {
    name: "Partition",
    pinned: true,
    columns: [
      {
        uniqueName: "Index",
        description:
          "The stable index identifying the physical partition in the database.",
        headerColWidth: 45,
        headerColAlign: "right",
      },
      {
        uniqueName: "Offset",
        description:
          "The byte position where this partition begins in the database file.",
        headerColWidth: 75,
        headerColAlign: "right",
      },
      {
        uniqueName: "Tier",
        description:
          "The compaction tier holding this partition: hot, warm, cold, or off (awaiting reclaim). Reflects the utilization frequency of resident accounts.",
        headerColWidth: 55,
        headerColAlign: "right",
      },
    ],
  },
  {
    name: "Data",
    columns: [
      {
        uniqueName: "Utilization",
        description:
          "Shows the storage used as a percentage of capacity (32GB), including the fragmentation threshold for triggering compaction.",
        headerColWidth: 200,
      },
      {
        uniqueName: "Fragmentation",
        description:
          "The fraction of this partition's written data that has since been freed and will be deleted during this partition's next compaction.",
        headerColWidth: 90,
        headerColAlign: "right",
      },
      {
        uniqueName: "Reads/s",
        description:
          "The recent (~5s) rate of read operations from this partition, per second.",
        headerColWidth: 55,
        headerColAlign: "right",
        headerColor: "var(--accounts-read-color)",
      },
      {
        uniqueName: "Writes/s",
        description:
          "The recent (~5s) rate of write operations into this partition, per second.",
        headerColWidth: 55,
        headerColAlign: "right",
        headerColor: "var(--accounts-write-color)",
      },
      {
        uniqueName: "Read IO",
        description:
          "The recent (~5s) rate of bytes read into this partition, per second.",
        headerColWidth: 85,
        headerColAlign: "right",
        headerColor: "var(--accounts-read-color)",
      },
      {
        uniqueName: "Write IO",
        description:
          "The recent (~5s) rate of bytes written into this partition, per second.",
        headerColWidth: 85,
        headerColAlign: "right",
        headerColor: "var(--accounts-write-color)",
      },
      {
        uniqueName: "Compacting",
        description:
          "Whether this partition is idle, queued for compaction, or being compacted. Compaction occurs when full and the fragmentation threshold is reached.",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "Created",
        description:
          "How long ago this partition was first opened for writing.",
        headerColWidth: 75,
        headerColAlign: "right",
      },
      {
        uniqueName: "Filled",
        description:
          "How long ago this partition was closed to new writes, or zero if still active.",
        headerColWidth: 75,
        headerColAlign: "right",
      },
    ],
  },
];
