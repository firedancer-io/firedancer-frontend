import type { ColumnGroup } from "../../../components/DataTable";

export const cacheClassGroups: ColumnGroup[] = [
  {
    name: "Size",
    pinned: true,
    columns: [
      {
        uniqueName: "Size",
        description: "",
        headerColWidth: 70,
      },
    ],
  },
  {
    name: "Data",
    columns: [
      {
        uniqueName: "Capacity",
        description: "",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "Current",
        description: "",
        headerColWidth: 80,
        headerColAlign: "right",
      },
      {
        uniqueName: "Usage",
        description: "",
        headerColWidth: 250,
      },
      {
        uniqueName: "Reserved",
        description: "",
        headerColWidth: 70,
        headerColAlign: "right",
      },
      {
        uniqueName: "Hit Rate",
        description: "",
        headerColWidth: 70,
        headerColAlign: "right",
      },
      {
        uniqueName: "Reads/s",
        description: "",
        headerColWidth: 75,
        headerColAlign: "right",
      },
      {
        uniqueName: "Writes/s",
        description: "",
        headerColWidth: 75,
        headerColAlign: "right",
      },
      {
        uniqueName: "Commits/s",
        description: "",
        headerColWidth: 100,
        headerColAlign: "right",
      },
      {
        uniqueName: "Misses/s",
        description: "",
        headerColWidth: 75,
        headerColAlign: "right",
      },
      {
        uniqueName: "Evicts/s",
        description: "",
        headerColWidth: 75,
        headerColAlign: "right",
      },
      {
        uniqueName: "Preevicts/s",
        description: "",
        headerColWidth: 75,
        headerColAlign: "right",
      },
    ],
  },
];
