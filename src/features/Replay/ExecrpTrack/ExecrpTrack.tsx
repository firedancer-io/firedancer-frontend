import { useAtomValue, useSetAtom } from "jotai";
import { useRef, useCallback, useLayoutEffect, useState } from "react";
import { useThrottledCallback } from "use-debounce";
import {
  type ExplorableChartProps,
  type MarkerLinesProps,
  type RangeChangeSubscriberProps,
} from "../const.ts";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import { tileCountAtom } from "../../Overview/SlotPerformance/atoms.ts";
import styles from "../chart.module.css";
import {
  drawExecrp,
  hitTestTxn,
  moveCamera,
  render,
  setUpRenderer,
  type RendererObj,
} from "./utils.ts";
import useTxnTimestampsQuery from "./useTxnTimestampsQuery.ts";
import { replayTxnTimestampsCacheAtom } from "./txnTimestamps.ts";
import { selectedInfoAtom } from "../selectedInfo.ts";
import { EXECRP_THRESHOLD_MS } from "./consts.ts";

// A pointer that moves more than this between down and up is a pan, not a click.
const CLICK_MOVE_TOLERANCE_PX = 4;
// Time slack (fraction of the visible span) so thin bars stay clickable.
const CLICK_TOL_FRACTION = 0.005;

const ROW_HEIGHT_PX = 48;
const subscriptionId = "execrp-track";

interface ExecrpTrackProps
  extends WebGlRemountProps,
    RangeChangeSubscriberProps,
    ExplorableChartProps,
    MarkerLinesProps {
  width: number;
}

function ExecrpTrack({
  remount,
  subscribeRangeChange,
  getAbsoluteNs,
  getRelativeMs,
  setUpExploreListeners,
  markerLinesClassName,
  width,
}: ExecrpTrackProps) {
  // The execrp track only renders per-txn detail, so it's hidden for visible
  // ranges too wide to be meaningful (see EXECRP_THRESHOLD_MS). The default
  // window is narrower than the threshold, so it starts shown.
  const [isVisible, setIsVisible] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const widthRef = useRef(width);
  widthRef.current = width;
  const hasWidth = width > 0;

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const timestampsQuery = useTxnTimestampsQuery();
  const setSelectedInfo = useSetAtom(selectedInfoAtom);
  const cache = useAtomValue(replayTxnTimestampsCacheAtom);
  const execrpTileCount = useAtomValue(tileCountAtom).execrp;
  // One row per execrp (execution/replay) tile — the rows are indexed by
  // txn_exec_idx, which corresponds to that tile type.
  const execrpCount = execrpTileCount > 0 ? execrpTileCount : 1;
  const height = execrpCount * ROW_HEIGHT_PX;

  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const execrpCountRef = useRef(execrpCount);
  execrpCountRef.current = execrpCount;
  // Latest visible range, kept for click hit-testing (set on every range change).
  const visibleRangeRef = useRef<TsRange>([0, 0]);
  const getRelativeMsRef = useRef(getRelativeMs);
  getRelativeMsRef.current = getRelativeMs;

  // Full geometry rebuild — O(cached txns). Only needed when the data or canvas
  // size changes, NOT on pan/zoom: rects are positioned at absolute times via
  // the mesh referenceX / position.x scheme, so navigating just moves the camera.
  const draw = useCallback(() => {
    if (!rendererRef.current) return;
    drawExecrp(
      rendererRef.current,
      cacheRef.current,
      execrpCountRef.current,
      getRelativeMs,
    );
    render(rendererRef.current);
  }, [getRelativeMs]);

  // Throttle the WS query so a drag/zoom gesture fires ~one round of requests,
  // not one per frame (mirrors the revenue track).
  const throttledQuery = useThrottledCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      const visibleRangeNs: NsTsRange = [
        getAbsoluteNs(visibleRangeMs[0]),
        getAbsoluteNs(visibleRangeMs[1]),
      ];
      timestampsQuery(visibleRangeNs, getAbsoluteNs(worldRangeMs[1]));
    },
    100,
    { leading: true, trailing: true },
  );

  /**
   * Per-frame on pan/zoom: hide the track past the threshold, kick off a
   * (throttled) query, and move the camera. Geometry is NOT rebuilt here — only
   * the camera moves, which is O(1); redraws happen on data/size change.
   */
  const onRangeChange = useCallback(
    (visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      visibleRangeRef.current = visibleRangeMs;
      if (!rendererRef.current) return;

      const visible =
        visibleRangeMs[1] - visibleRangeMs[0] < EXECRP_THRESHOLD_MS;
      setIsVisible(visible);
      if (!visible) {
        // Track is hidden — clear its own txn selection from the shared banner,
        // but leave other kinds (e.g. an agg fee bucket) intact.
        setSelectedInfo((prev) => (prev?.kind === "txn" ? undefined : prev));
        return;
      }

      throttledQuery(visibleRangeMs, worldRangeMs);

      moveCamera(rendererRef.current, visibleRangeMs);
      render(rendererRef.current);
    },
    [throttledQuery, setSelectedInfo],
  );

  // Click a transaction to select it (distinguished from a pan by pointer
  // movement). Hit-tests against the cached geometry using the current visible
  // range; a hit sets the shared selection, a miss clears it.
  const onCanvasClick = useCallback(
    (e: MouseEvent, downX: number, downY: number) => {
      if (
        Math.abs(e.clientX - downX) > CLICK_MOVE_TOLERANCE_PX ||
        Math.abs(e.clientY - downY) > CLICK_MOVE_TOLERANCE_PX
      ) {
        return; // treat as pan/drag, not a click
      }
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const fracX = (e.clientX - rect.left) / rect.width;
      const fracY = (e.clientY - rect.top) / rect.height;

      const [start, end] = visibleRangeRef.current;
      const tolMs = (end - start) * CLICK_TOL_FRACTION;
      const hit = hitTestTxn(
        cacheRef.current,
        execrpCountRef.current,
        getRelativeMsRef.current,
        visibleRangeRef.current,
        fracX,
        fracY,
        tolMs,
      );
      setSelectedInfo(
        hit ? { kind: "txn", slot: hit.slot, txnIdx: hit.txnIdx } : undefined,
      );
    },
    [setSelectedInfo],
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (rendererRef.current || !hasWidth || !containerRef.current) return;

    const rendererObj = setUpRenderer(
      widthRef.current,
      height,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    containerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribe = subscribeRangeChange(subscriptionId, onRangeChange);
    const cleanUpExploreListeners = setUpExploreListeners(containerRef.current);
    const cleanUp = rendererRef.current.cleanUp;

    // Track the mousedown position so a click (select) can be told apart from a
    // drag (pan). The click fires on mouseup regardless of movement.
    const el = containerRef.current;
    let downX = 0;
    let downY = 0;
    const onMouseDown = (e: MouseEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onClick = (e: MouseEvent) => onCanvasClick(e, downX, downY);
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("click", onClick);

    return () => {
      unsubscribe?.();
      cleanUp();
      rendererRef.current = undefined;
      cleanUpExploreListeners();
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("click", onClick);
    };
  }, [
    onRangeChange,
    onCanvasClick,
    setUpExploreListeners,
    subscribeRangeChange,
    setUpContextListeners,
    getWasContextLost,
    hasWidth,
    height,
  ]);

  // handle chart resize (setSize + full redraw so the outline shader's
  // resolution uniform is refreshed for the new drawing buffer)
  useLayoutEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, height);
    draw();
  }, [width, height, draw]);

  // redraw when the cached data changes
  useLayoutEffect(() => {
    draw();
  }, [cache, execrpCount, draw]);

  return (
    <div
      className={styles.track}
      style={{
        position: "relative",
        width: "100%",
        height: `${height}px`,
        display: isVisible ? "block" : "none",
      }}
    >
      {/* WebGL canvas host — its children are replaced imperatively. */}
      <div
        ref={containerRef}
        className={markerLinesClassName}
        style={{ position: "absolute", inset: 0 }}
      />
      {/* execrp tile labels overlay (one per row, top-down like the rows). */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {Array.from({ length: execrpCount }, (_, execrp) => (
          <div
            key={execrp}
            style={{
              position: "absolute",
              top: `${execrp * ROW_HEIGHT_PX + 2}px`,
              left: 4,
              fontSize: 11,
              fontWeight: 600,
              color: "#b0b0b0",
              textShadow: "0 0 3px #141720, 0 0 3px #141720",
            }}
          >
            {`execrp ${execrp}`}
          </div>
        ))}
      </div>
    </div>
  );
}

const ExecrpTrackWithRemount = withWebGlRemount(ExecrpTrack);
export default ExecrpTrackWithRemount;
