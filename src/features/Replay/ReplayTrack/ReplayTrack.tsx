import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  BAR_HEIGHT_RATIO,
  tileStateLabels,
  toLegendItem,
  trackStates,
} from "../tileStates/consts.ts";
import type { TileStatesTrackConfig } from "../tileStates/utils.ts";
import { createReplayComposite, getLaneGapPx } from "./replayComposite.ts";
import { useTileStatesRenderer } from "../tileStates/useTileStatesRenderer.ts";
import { useTileStatesQuery } from "../tileStates/useTileStatesQuery.ts";
import type { AggTileStatesQuery } from "../tileStates/useAggTileStatesQuery.ts";
import LaneLabels from "./LaneLabels.tsx";
import TrackControls from "../TrackControls.tsx";
import {
  getRowsLayout,
  ROW_LABEL_PX,
  trackInsetPx,
  trackNames,
} from "../layout.ts";
import styles from "../track.module.css";

/** A lane per state, top-down */
const states = trackStates.replay.txn;

const laneLabels = states.map((state) => tileStateLabels[state]);
const legend = states.map(toLegendItem);

const config: TileStatesTrackConfig = {
  kind: "replay",
  getStates: () => states,
  createComposite: createReplayComposite,
};

interface ReplayTrackProps extends WebGlRemountProps {
  height: number;
  aggQuery: AggTileStatesQuery;
}

function ReplayTrack({ height, aggQuery, remount }: ReplayTrackProps) {
  const { query, aggGranularity, granularityLevels } =
    useTileStatesQuery(aggQuery);
  const { containerRef, rows, isAgg } = useTileStatesRenderer({
    config,
    remount,
    query,
    granularityLevels,
  });
  const layout = getLanesLayout(height, rows.length);
  const laneGapPx = getLaneGapPx(
    layout.rowPx * BAR_HEIGHT_RATIO,
    states.length,
  );

  return (
    <>
      <div
        className={styles.rows}
        style={{
          top: layout.topPx,
          height: layout.rowPx * Math.max(rows.length, 1),
        }}
      >
        <div ref={containerRef} className={styles.trackCanvasContainer} />
      </div>
      <LaneLabels
        rowCount={rows.length}
        laneLabels={laneLabels}
        layout={layout}
        laneGapPx={laneGapPx}
      />
      <TrackControls
        name={trackNames.replay}
        trackId="replay"
        bucketSize={isAgg ? aggGranularity : "slot"}
        legend={legend}
      />
    </>
  );
}

/** Drops the inset if lanes would be too thin for their labels */
function getLanesLayout(heightPx: number, rowCount: number) {
  const layout = getRowsLayout(heightPx, rowCount, {
    insetPx: trackInsetPx.replay,
    fillWhenThin: true,
  });
  const lanePx = (layout.rowPx * BAR_HEIGHT_RATIO) / states.length;
  if (lanePx < ROW_LABEL_PX) {
    return getRowsLayout(heightPx, rowCount, { insetPx: 0 });
  }
  return layout;
}

const ReplayTrackWithRemount = withWebGlRemount(ReplayTrack);
export default ReplayTrackWithRemount;
