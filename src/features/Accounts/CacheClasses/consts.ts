import type { ColumnGroup } from "../../../components/DataTable";

export const cacheClassGroups: ColumnGroup[] = [
  {
    name: "Size",
    pinned: true,
    columns: [
      {
        uniqueName: "Size",
        description:
          "The account data size range for this cache class, bounding the size of accounts stored in each class.",
        headerColWidth: 70,
      },
    ],
  },
  {
    name: "Data",
    columns: [
      {
        uniqueName: "Capacity",
        description:
          "The maximum number accounts able to be stored in this class.",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "Current",
        description: "The number of accounts currently stored in this class.",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "Cache",
        description:
          "The storage utilization in bytes, scaled by the actual size of the underlying class.",
        headerColWidth: 250,
      },
      {
        uniqueName: "Usage",
        description:
          "The storage utilization in accounts, as a percentage of the class capacity with hysteresis thresholds for an eager eviction policy shown.",
        headerColWidth: 250,
      },
      {
        uniqueName: "Reserved",
        description:
          "The number of account slots in the class which have been reserved for use (even if they are not yet present in the cache).",
        headerColWidth: 70,
        headerColAlign: "right",
      },
      {
        uniqueName: "Hit Rate",
        description:
          "The recent (~5s) fraction of lookups in this class served from cache instead of disk.",
        headerColWidth: 70,
        headerColAlign: "right",
      },
      {
        uniqueName: "Reads/s",
        description:
          "The recent (~5s) rate at which accounts in this class were opened for reading, per second.",
        headerColWidth: 75,
        headerColAlign: "right",
        headerColor: "var(--accounts-read-color)",
      },
      {
        uniqueName: "Writes/s",
        description:
          "The recent (~5s) rate at which accounts in this class were opened for writing, per second.",
        headerColWidth: 75,
        headerColAlign: "right",
        headerColor: "var(--accounts-write-color)",
      },
      {
        uniqueName: "Commits/s",
        description:
          "The recent (~5s) rate of account commits (i.e. writes made visible to later reads) in this size class, per second.",
        headerColWidth: 100,
        headerColAlign: "right",
      },
      {
        uniqueName: "Misses/s",
        description:
          "The recent (~5s) rate of lookups that had to read from disk in this class, per second.",
        headerColWidth: 75,
        headerColAlign: "right",
      },
      {
        uniqueName: "Evicts/s",
        description:
          "The recent (~5s) rate at which accounts were removed from this class in the hot-path to free space for an insert in-progress, per second.",
        headerColWidth: 75,
        headerColAlign: "right",
      },
      {
        uniqueName: "Preevicts/s",
        description:
          "The recent (~5s) rate at which a background task removed accounts eagerly to free space in this class, per second.",
        headerColWidth: 75,
        headerColAlign: "right",
      },
    ],
  },
];
