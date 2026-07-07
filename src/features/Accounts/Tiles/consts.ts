import type { ColumnGroup } from "../../../components/DataTable";

export const accountTileGroups: ColumnGroup[] = [
  {
    name: "Tile",
    pinned: true,
    columns: [
      {
        uniqueName: "Tile",
        description:
          "The name and per-instance index of each tile which uses the accounts database.",
        headerColWidth: 85,
      },
    ],
  },
  {
    name: "Data",
    columns: [
      {
        uniqueName: "Type",
        description:
          "Whether the tile both reads and writes accounts (RW) or only reads them (RO).",
        headerColWidth: 40,
      },
      {
        uniqueName: "Hit Rate",
        description:
          "The recent (~5s) fraction of this tile's lookups served from cache instead of disk.",
        headerColWidth: 70,
        headerColAlign: "right",
      },
      {
        uniqueName: "Acquire/s",
        description:
          "The recent (~5s) rate of batched requests this tile made to open a group of accounts for reading or writing, per second.",
        headerColWidth: 60,
        headerColAlign: "right",
      },
      {
        uniqueName: "Acc Read/s",
        description:
          "The recent (~5s) rate at which this tile opened accounts for reading, per second.",
        headerColWidth: 75,
        headerColAlign: "right",
        headerColor: "var(--accounts-read-color)",
      },
      {
        uniqueName: "Acc Write/s",
        description:
          "The recent (~5s) rate at which this tile opened accounts for writing, per second.",
        headerColWidth: 75,
        headerColAlign: "right",
        headerColor: "var(--accounts-write-color)",
      },
      {
        uniqueName: "History (1m)",
        description:
          "A recent (~1m) view of this tile's read and write activity.",
        headerColWidth: 200,
      },
      {
        uniqueName: "Acc Commits/s",
        description:
          "The recent (~5s) rate at which this tile committed (i.e. writes made visible to later reads) account changes, per second.",
        headerColWidth: 95,
        headerColAlign: "right",
      },
      {
        uniqueName: "Acc Misses/s",
        description:
          "The recent (~5s) rate of this tile's lookups that had to read from disk, per second.",
        headerColWidth: 85,
        headerColAlign: "right",
      },
      {
        uniqueName: "Acc Evicts/s",
        description:
          "The recent (~5s) rate at which this tile's writes pushed accounts out of the cache in the hot-path to free space for an insert in-progress, per second.",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "Disk Read/s",
        description:
          "The recent (~5s) rate at which this tile read data from disk, in bytes per second.",
        headerColWidth: 80,
        headerColAlign: "right",
        headerColor: "var(--accounts-read-color)",
      },
      {
        uniqueName: "Disk Write/s",
        description:
          "The recent (~5s) rate at which this tile wrote data to disk, in bytes per second.",
        headerColWidth: 80,
        headerColAlign: "right",
        headerColor: "var(--accounts-write-color)",
      },
      {
        uniqueName: "Disk Read",
        description:
          "The total amount of data this tile has read from disk since startup.",
        headerColWidth: 80,
        headerColAlign: "right",
        headerColor: "var(--accounts-read-color)",
      },
      {
        uniqueName: "Disk Write",
        description:
          "The total amount of data this tile has written to disk since startup.",
        headerColWidth: 80,
        headerColAlign: "right",
        headerColor: "var(--accounts-write-color)",
      },
      {
        uniqueName: "Acc Acquired",
        description:
          "The total number of accounts this tile has opened, for reading or writing, since startup.",
        headerColWidth: 110,
        headerColAlign: "right",
      },
    ],
  },
];
