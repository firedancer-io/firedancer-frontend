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
import CpuTrack from "./CpuTrack/CpuTrack.tsx";
import TrackLayout from "./TrackLayout.tsx";
import { cpuRowsAtom, queryTilesAtom } from "./CpuTrack/atoms.ts";
import styles from "./chart.module.css";

const allTracks: TrackId[] = ["shreds", "income", "banks", "replay", "cpu"];

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

  const tracks = useMemo(
    () => (hasCpu ? allTracks : allTracks.filter((id) => id !== "cpu")),
    [hasCpu],
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
        tracks.map((id) => (
          <TrackLayout key={id} trackId={id} height={heights[id] ?? 0}>
            {renderTrack(id, heights[id] ?? 0)}
          </TrackLayout>
        ))}
    </div>
  );
}

function renderTrack(id: TrackId, height: number) {
  switch (id) {
    case "shreds":
      return <ShredsTrack />;
    case "income":
      return <RevenueTrack height={height} />;
    case "banks":
      return <TileStatesTrack kind="execrp" height={height} />;
    case "replay":
      return <TileStatesTrack kind="replay" height={height} />;
    case "cpu":
      return <CpuTrack height={height} />;
  }
}
