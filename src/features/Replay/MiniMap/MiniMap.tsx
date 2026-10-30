import { useRef, useCallback, useLayoutEffect, useState } from "react";
import type { WebGlRemountProps } from "../../WebGl/withWebGlRemount.tsx";
import { useWebGlEventHandlers } from "../../WebGl/useWebGlEventHandlers.ts";
import withWebGlRemount from "../../WebGl/withWebGlRemount.tsx";
import {
  drawMiniMap,
  trackHeight,
  moveCamera,
  render,
  setUpRenderer,
  type RendererObj,
} from "./utils.ts";
import type { NsTsRange, TsRange } from "../../WebGl/webglUtils.ts";
import useMiniMapQuery, { getMiniMapGranularity } from "./useMiniMapQuery.ts";
import type { AggSlots } from "../../../api/types.ts";
import { calcAbsoluteNs } from "../utils.ts";
import { useThrottledCallbackIfVisible } from "../../../api/useDebounceIfVisible.ts";
import styles from "./miniMap.module.css";
import clsx from "clsx";
import { Box } from "@radix-ui/themes";
import { Popover } from "radix-ui";
import { referenceNsAtom, visibleRangeAtom, worldRangeAtom } from "../atoms.ts";
import VisibleRangeInfo from "../VisibleRangeInfo.tsx";
import { containerElAtom } from "../../../atoms.ts";
import { getDefaultStore, useAtomValue } from "jotai";
import EventsTrack from "./EventsTrack/EventsTrack.tsx";

const store = getDefaultStore();

interface MiniMapProps extends WebGlRemountProps {
  setUpMiniMap: (
    trackEl: HTMLDivElement,
    visibleRangeEl: HTMLDivElement,
    leftHandleEl: HTMLDivElement,
    rightHandleEl: HTMLDivElement,
  ) => () => void;
  panToTs: (ts: number) => void;
  width: number;
}

function MiniMap({ remount, setUpMiniMap, width, panToTs }: MiniMapProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  const popoverContainerEl = useAtomValue(containerElAtom);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const visibleRangeElRef = useRef<HTMLDivElement>(null);
  const leftHandleRef = useRef<HTMLDivElement>(null);
  const rightHandleRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RendererObj | undefined>();

  const { setUpContextListeners, getWasContextLost } = useWebGlEventHandlers({
    remount,
  });

  const onMessage = useCallback((message: { id: number; value: AggSlots }) => {
    const referenceNs = store.get(referenceNsAtom);
    if (!rendererRef.current || referenceNs == null) return;

    drawMiniMap(rendererRef.current, message.value, referenceNs);
    render(rendererRef.current);
  }, []);

  const query = useMiniMapQuery(onMessage);

  const updateVisibleEl = useThrottledCallbackIfVisible(
    useCallback((visibleRangeMs: TsRange, worldRangeMs: TsRange) => {
      const el = visibleRangeElRef.current;
      if (!el) return;
      const worldRange = worldRangeMs[1] - worldRangeMs[0];
      const pct = ((visibleRangeMs[1] - visibleRangeMs[0]) / worldRange) * 100;
      el.style.width = `${pct}%`;

      const centerTs = (visibleRangeMs[0] + visibleRangeMs[1]) / 2;
      const leftPct = ((centerTs - worldRangeMs[0]) / worldRange) * 100;
      el.style.left = `${leftPct}%`;
    }, []),
    30,
    {
      leading: true,
      trailing: true,
    },
  );

  const updateWorldEl = useCallback(
    (referenceNs: bigint, worldRangeMs: TsRange) => {
      if (!rendererRef.current) return;
      const granularity = getMiniMapGranularity(
        worldRangeMs[1] - worldRangeMs[0],
      );
      const worldRangeNs: NsTsRange = [
        calcAbsoluteNs(referenceNs, worldRangeMs[0]),
        calcAbsoluteNs(referenceNs, worldRangeMs[1]),
      ];
      query(worldRangeNs, granularity);
      moveCamera(rendererRef.current, worldRangeMs);
      render(rendererRef.current);
    },
    [query],
  );

  /**
   * Update camera and query data for new range
   */
  const onRangeChange = useCallback(
    (updateOnlyVisible: boolean) => {
      if (!rendererRef.current) return;

      const referenceNs = store.get(referenceNsAtom);
      const visibleRange = store.get(visibleRangeAtom);
      const worldRange = store.get(worldRangeAtom);

      if (referenceNs == null || !visibleRange || !worldRange) return;

      if (!updateOnlyVisible) {
        updateWorldEl(referenceNs, worldRange);
      }
      updateVisibleEl(visibleRange, worldRange);
    },
    [updateVisibleEl, updateWorldEl],
  );

  // set up renderer and subscribe to range change, to trigger queries
  useLayoutEffect(() => {
    if (
      rendererRef.current ||
      !containerRef.current ||
      !chartContainerRef.current ||
      !visibleRangeElRef.current ||
      !leftHandleRef.current ||
      !rightHandleRef.current
    )
      return;

    const rendererObj = setUpRenderer(
      0,
      trackHeight,
      setUpContextListeners,
      getWasContextLost,
    );
    if (!rendererObj) return;

    rendererRef.current = rendererObj;
    chartContainerRef.current.replaceChildren(rendererObj.renderer.domElement);

    const unsubscribes = [
      store.sub(visibleRangeAtom, () => onRangeChange(true)),
      store.sub(worldRangeAtom, () => onRangeChange(false)),
    ];

    const cleanUpMiniMapListeners = setUpMiniMap(
      containerRef.current,
      visibleRangeElRef.current,
      leftHandleRef.current,
      rightHandleRef.current,
    );

    const cleanUpRenderer = rendererRef.current.cleanUp;

    // trigger initial draw
    setIsInitialized(true);
    onRangeChange(false);

    // cleanup
    return () => {
      // cancel pending trailing timers so they don't accumulate across remounts
      updateVisibleEl.cancel();
      unsubscribes.forEach((unsub) => unsub());
      cleanUpRenderer();
      rendererRef.current = undefined;
      cleanUpMiniMapListeners();
    };
  }, [
    onRangeChange,
    setUpContextListeners,
    getWasContextLost,
    setUpMiniMap,
    updateVisibleEl,
  ]);

  // handle chart resize
  useLayoutEffect(() => {
    if (!isInitialized || !rendererRef.current) return;
    rendererRef.current.renderer.setSize(width, trackHeight);
    render(rendererRef.current);
  }, [isInitialized, width]);

  return (
    <Box ref={containerRef} className={styles.miniMapContainer}>
      <div ref={chartContainerRef} className={styles.miniMapTrack} />
      <Popover.Root open>
        <Popover.Anchor asChild>
          <div ref={visibleRangeElRef} className={styles.visibleRangeBox}>
            <div
              ref={leftHandleRef}
              className={clsx(styles.handle, styles.left)}
            />
            <div
              ref={rightHandleRef}
              className={clsx(styles.handle, styles.right)}
            />
          </div>
        </Popover.Anchor>
        <Popover.Portal container={popoverContainerEl}>
          <Popover.Content
            className={styles.miniMapPopover}
            side="top"
            sideOffset={4}
            collisionPadding={{ top: -9999, left: 0, right: 0, bottom: 8 }}
            arrowPadding={0}
            // permanently-open, don't steal focus or trap it
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <VisibleRangeInfo width={width} />
            <PopoverBottomArrow />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <EventsTrack width={width} panToTs={panToTs} />
    </Box>
  );
}

/**
 * Downward-pointing popover arrow. Specify border color and background color as
 * stroke and fill
 */
function PopoverBottomArrow() {
  return (
    <Popover.Arrow
      asChild
      width={10}
      height={5}
      fill="var(--replay-popover-background-color)"
      stroke="var(--replay-popover-border-color)"
      strokeWidth={1}
    >
      <svg
        viewBox="0 0 30 10"
        preserveAspectRatio="none"
        className={styles.miniMapPopoverArrow}
      >
        <path d="M0 0 L15 10 L30 0" vectorEffect="non-scaling-stroke" />
      </svg>
    </Popover.Arrow>
  );
}

const MiniMapTrackWithRemount = withWebGlRemount(MiniMap);
export default MiniMapTrackWithRemount;
