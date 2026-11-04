import type { PropsWithChildren } from "react";
import { useAtomValue } from "jotai";
import { hiddenTracksAtom } from "./atoms.ts";
import { TRACK_TITLE_PX, trackNames, type TrackId } from "./layout.ts";
import TrackControls from "./TrackControls.tsx";
import styles from "./track.module.css";

interface TrackLayoutProps {
  trackId: TrackId;
  height: number;
}

export default function TrackLayout({
  trackId,
  height,
  children,
}: PropsWithChildren<TrackLayoutProps>) {
  const isHidden = useAtomValue(hiddenTracksAtom).has(trackId);

  return (
    <div
      className={styles.trackContainer}
      style={{ height: isHidden ? TRACK_TITLE_PX : height }}
    >
      {isHidden ? (
        <TrackControls
          name={trackNames[trackId]}
          bucketSize={undefined}
          trackId={trackId}
        />
      ) : (
        children
      )}
    </div>
  );
}
