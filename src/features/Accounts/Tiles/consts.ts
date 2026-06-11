import type { ColumnGroup } from "../../../components/DataTable";

export const accountTileGroups: ColumnGroup[] = [
  {
    name: "Tile",
    pinned: true,
    columns: [
      {
        uniqueName: "Tile",
        description:
          "The name and index of each tile. A tile represents a sandboxed process or individual thread that communicates with other tiles using message passing queues.",
        headerColWidth: 85,
      },
    ],
  },
  {
    name: "Data",
    columns: [
      {
        uniqueName: "Type",
        description: "",
        headerColWidth: 40,
      },
      {
        uniqueName: "Hit Rate",
        description: "",
        headerColWidth: 70,
        headerColAlign: "right",
      },
      {
        uniqueName: "Acquire/s",
        description: "",
        headerColWidth: 60,
        headerColAlign: "right",
      },
      {
        uniqueName: "Acc Read/s",
        description: "",
        headerColWidth: 75,
        headerColAlign: "right",
        headerColor: "var(--accounts-read-color)",
      },
      {
        uniqueName: "Acc Write/s",
        description: "",
        headerColWidth: 75,
        headerColAlign: "right",
        headerColor: "var(--accounts-write-color)",
      },
      {
        uniqueName: "History (1m)",
        description: "",
        headerColWidth: 200,
      },
      {
        uniqueName: "Acc Commits/s",
        description: "",
        headerColWidth: 95,
        headerColAlign: "right",
      },
      {
        uniqueName: "Acc Misses/s",
        description: "",
        headerColWidth: 85,
        headerColAlign: "right",
      },
      {
        uniqueName: "Acc Evicts/s",
        description: "",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "Disk Read/s",
        description: "",
        headerColWidth: 80,
        headerColAlign: "right",
        headerColor: "var(--accounts-read-color)",
      },
      {
        uniqueName: "Disk Write/s",
        description: "",
        headerColWidth: 80,
        headerColAlign: "right",
        headerColor: "var(--accounts-write-color)",
      },
      {
        uniqueName: "Disk Read",
        description: "",
        headerColWidth: 80,
        headerColAlign: "right",
        headerColor: "var(--accounts-read-color)",
      },
      {
        uniqueName: "Disk Write",
        description: "",
        headerColWidth: 80,
        headerColAlign: "right",
        headerColor: "var(--accounts-write-color)",
      },
      {
        uniqueName: "Acc Acquired",
        description: "",
        headerColWidth: 110,
        headerColAlign: "right",
      },
    ],
  },
];
