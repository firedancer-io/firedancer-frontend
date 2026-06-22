import type { ColumnGroup } from "../../../components/DataTable";

export const partitionGroups: ColumnGroup[] = [
  {
    name: "Partition",
    pinned: true,
    columns: [
      {
        uniqueName: "Index",
        description: "",
        headerColWidth: 45,
        headerColAlign: "right",
      },
      {
        uniqueName: "Offset",
        description: "",
        headerColWidth: 75,
        headerColAlign: "right",
      },
      {
        uniqueName: "Tier",
        description: "",
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
        description: "",
        headerColWidth: 200,
      },
      {
        uniqueName: "Fragmentation",
        description: "",
        headerColWidth: 90,
        headerColAlign: "right",
      },
      {
        uniqueName: "Reads/s",
        description: "",
        headerColWidth: 55,
        headerColAlign: "right",
        headerColor: "var(--accounts-read-color)",
      },
      {
        uniqueName: "Writes/s",
        description: "",
        headerColWidth: 55,
        headerColAlign: "right",
        headerColor: "var(--accounts-write-color)",
      },
      {
        uniqueName: "Read IO",
        description: "",
        headerColWidth: 85,
        headerColAlign: "right",
        headerColor: "var(--accounts-read-color)",
      },
      {
        uniqueName: "Write IO",
        description: "",
        headerColWidth: 85,
        headerColAlign: "right",
        headerColor: "var(--accounts-write-color)",
      },
      {
        uniqueName: "Compacting",
        description: "",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "Created",
        description: "",
        headerColWidth: 75,
        headerColAlign: "right",
      },
      {
        uniqueName: "Filled",
        description: "",
        headerColWidth: 75,
        headerColAlign: "right",
      },
    ],
  },
];
