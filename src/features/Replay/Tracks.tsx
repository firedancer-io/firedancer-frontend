import { atom, useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { useMeasure } from "react-use";
import { tilesAtom } from "../../api/atoms.ts";
import { hiddenTracksAtom } from "./atoms.ts";
import { getTrackHeights, TRACK_GAP_PX, type TrackId } from "./layout.ts";
import ShredsTrack from "./ShredsTrack/ShredsTrack.tsx";
import RevenueTrack from "./RevenueTrack/RevenueTrack.tsx";
import ExecrpTrack from "./ExecrpTrack/ExecrpTrack.tsx";
import ReplayTrack from "./ReplayTrack/ReplayTrack.tsx";
import { getTileRows } from "./tileStates/utils.ts";
import {
  useAggTileStatesQuery,
  type AggTileStatesQuery,
} from "./tileStates/useAggTileStatesQuery.ts";
import CpuTrack from "./CpuTrack/CpuTrack.tsx";
import VotesTrack from "./VotesTrack/VotesTrack.tsx";
import { isVotesTrackAvailableAtom } from "./VotesTrack/atoms.ts";
import TrackLayout from "./TrackLayout.tsx";
import { cpuRowsAtom, queryTilesAtom } from "./CpuTrack/atoms.ts";
import styles from "./chart.module.css";

const allTracks: TrackId[] = [
  "shreds",
  "votes",
  "banks",
  "replay",
  "cpu",
  "income",
];

const banksRowsAtom = atom(
  (get) => getTileRows(get(tilesAtom), "execrp").length,
);
const cpuRowCountAtom = atom((get) => get(cpuRowsAtom).length);

export default function Tracks() {
  const [measureRef, { height }] = useMeasure<HTMLDivElement>();

  const hidden = useAtomValue(hiddenTracksAtom);
  const banksRows = useAtomValue(banksRowsAtom);
  const cpuRows = useAtomValue(cpuRowCountAtom);
  const hasCpu = useAtomValue(queryTilesAtom).length > 0;
  const hasVotes = useAtomValue(isVotesTrackAvailableAtom);

  const aggTileStatesQuery = useAggTileStatesQuery();
  const { pauseStaleRefreshes: pauseStaleAggTileStatesRefreshes } =
    aggTileStatesQuery;
  const isTileStatesHidden = hidden.has("banks") && hidden.has("replay");

  useEffect(() => {
    if (isTileStatesHidden) pauseStaleAggTileStatesRefreshes();
  }, [isTileStatesHidden, pauseStaleAggTileStatesRefreshes]);

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
              {renderTrack(id, trackHeight, aggTileStatesQuery)}
            </TrackLayout>
          );
        })}
    </div>
  );
}

function renderTrack(
  id: TrackId,
  height: number,
  aggTileStatesQuery: AggTileStatesQuery,
) {
  switch (id) {
    case "shreds":
      return <ShredsTrack height={height} />;
    case "votes":
      return <VotesTrack height={height} />;
    case "income":
      return <RevenueTrack height={height} />;
    case "banks":
      return <ExecrpTrack height={height} aggQuery={aggTileStatesQuery} />;
    case "replay":
      return <ReplayTrack height={height} aggQuery={aggTileStatesQuery} />;
    case "cpu":
      return <CpuTrack height={height} />;
  }
}
