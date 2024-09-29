import { AgGridReact } from "@ag-grid-community/react";
import "@ag-grid-community/styles/ag-grid.css";
import "@ag-grid-community/styles/ag-theme-quartz.css";
import { useAtomValue } from "jotai";
import { peersAtom } from "../../atoms";
import { useMemo } from "react";
import { Peer } from "../../api/types";
import {
  ColDef,
  GetRowIdParams,
  ModuleRegistry,
} from "@ag-grid-community/core";
import { ClientSideRowModelModule } from "@ag-grid-community/client-side-row-model";
import { CsvExportModule } from "@ag-grid-community/csv-export";
import styles from "./grid.module.css";

ModuleRegistry.registerModules([ClientSideRowModelModule, CsvExportModule]);

function getRowId(params: GetRowIdParams<PeerRow>) {
  return params.data.pubkey;
}

function toRow(peer: Peer): PeerRow {
  const voteAccount = peer.vote.find((v) => v.activated_stake > 0);

  return {
    pubkey: peer.identity_pubkey,
    name: peer.info?.name,
    description: peer.info?.details,
    stake: voteAccount?.activated_stake,
    delinquent: voteAccount?.delinquent,
    lastVote: voteAccount?.last_vote,
    rootSlot: voteAccount?.root_slot,
  };
}

interface PeerRow {
  pubkey: string;
  name?: string | null;
  description?: string | null;
  stake?: number | null;
  delinquent?: boolean | null;
  lastVote?: number | null;
  rootSlot?: number | null;
}

const colDefs: ColDef<PeerRow>[] = [
  {
    field: "pubkey",
    initialWidth: 300,
    cellStyle: (params) => {
      return { color: params.data?.delinquent ? "#6D6F71" : "#B2BCC9" };
    },
    filter: true,
  },
  { field: "name", initialWidth: 300, filter: true },
  { field: "description", initialWidth: 500, filter: true },
  { field: "stake", initialSort: "desc", initialWidth: 180, filter: true },
  { field: "delinquent", initialWidth: 110, filter: true },
  { field: "lastVote", initialWidth: 110, filter: true },
  { field: "rootSlot", initialWidth: 110, filter: true },
];

export default function Grid() {
  const peers = useAtomValue(peersAtom);

  const peersList = useMemo(() => Object.values(peers).map(toRow), [peers]);

  return (
    <div
      className={`ag-theme-quartz-dark ${styles.grid}`}
      style={{ height: "100%" }}
    >
      <AgGridReact
        rowData={peersList}
        columnDefs={colDefs}
        getRowId={getRowId}
        // autoSizeStrategy={{
        //   type: "fitCellContents",
        // }}
      />
    </div>
  );
}
