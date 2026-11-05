import { atom, useAtomValue } from "jotai";
import { useMemo } from "react";
import { useMeasure } from "react-use";
import { tilesAtom } from "../../api/atoms.ts";
import { hiddenTracksAtom } from "./atoms.ts";
import { getTrackHeights, TRACK_GAP_PX, type TrackId } from "./layout.ts";
import ShredsTrack from "./ShredsTrack/ShredsTrack.tsx";
import RevenueTrack from "./RevenueTrack/RevenueTrack.tsx";
import TileStatesTrack from "./TileStatesTrack/TileStatesTrack.tsx";
import { getTileRows } from "./TileStatesTrack/utils.ts";
import {
  useAggTileStatesQuery,
  type AggTileStatesQuery,
} from "./TileStatesTrack/useAggTileStatesQuery.ts";
import CpuTrack from "./CpuTrack/CpuTrack.tsx";
import VotesTrack from "./VotesTrack/VotesTrack.tsx";
import { isVotesTrackAvailableAtom } from "./VotesTrack/atoms.ts";
import TrackLayout from "./TrackLayout.tsx";
import { cpuRowsAtom, queryTilesAtom } from "./CpuTrack/atoms.ts";
import styles from "./chart.module.css";

const allTracks: TrackId[] = [
  "shreds",
  "votes",
  "income",
  "banks",
  "replay",
  "cpu",
];

const banksRowsAtom = atom(
  (get) => getTileRows(get(tilesAtom), "execrp").length,
);
const cpuRowCountAtom = atom((get) => get(cpuRowsAtom).length);

export default function Tracks() {
  const [measureRef, { width, height }] = useMeasure<HTMLDivElement>();

  const hidden = useAtomValue(hiddenTracksAtom);
  const banksRows = useAtomValue(banksRowsAtom);
  const cpuRows = useAtomValue(cpuRowCountAtom);
  const hasCpu = useAtomValue(queryTilesAtom).length > 0;
  const hasVotes = useAtomValue(isVotesTrackAvailableAtom);

  const aggTileStatesQuery = useAggTileStatesQuery();

  const tracks = useMemo(
    () =>
      allTracks.filter(
        (id) => (id !== "cpu" || hasCpu) && (id !== "votes" || hasVotes),
      ),
    [hasCpu, hasVotes],
  );
  const heights = useMemo(
    () =>
      getTrackHeights({
        heightPx: height,
        tracks,
        hidden,
        banksRows,
        cpuRows,
      }),
    [height, tracks, hidden, banksRows, cpuRows],
  );

  return (
    <div
      ref={measureRef}
      className={styles.tracks}
      style={{ gap: TRACK_GAP_PX }}
    >
      {height > 0 &&
        tracks.map((id) => {
          const trackHeight = heights[id] ?? 0;
          return (
            <TrackLayout key={id} trackId={id} height={trackHeight}>
              {renderTrack(id, width, trackHeight, aggTileStatesQuery)}
            </TrackLayout>
          );
        })}
    </div>
  );
}

function renderTrack(
  id: TrackId,
  width: number,
  height: number,
  aggTileStatesQuery: AggTileStatesQuery,
) {
  switch (id) {
    case "shreds":
      return <ShredsTrack height={height} />;
    case "votes":
      return <VotesTrack width={width} height={height} />;
    case "income":
      return <RevenueTrack height={height} />;
    case "banks":
      return (
        <TileStatesTrack
          kind="execrp"
          height={height}
          aggQuery={aggTileStatesQuery}
          canShowErrorStates
        />
      );
    case "replay":
      return (
        <TileStatesTrack
          kind="replay"
          height={height}
          aggQuery={aggTileStatesQuery}
          showStateLabels
        />
      );
    case "cpu":
      return <CpuTrack height={height} />;
  }
}
