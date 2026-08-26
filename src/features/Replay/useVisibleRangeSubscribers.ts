import { useMemo, useRef, type MutableRefObject, type RefObject } from "react";
import type { TsRange } from "../WebGl/webglUtils";
import {
  type RangeChangeHandler,
  type RangeChangeSubscriberProps,
} from "./const";
import { calcAbsoluteNs, calcRelativeMs } from "./utils";

interface UseVisibleRangeSubscribersProps {
  rangeRef: RefObject<
    | {
        referenceNs: bigint;
        worldEndMs: number;
        visibleRangeMs: TsRange;
      }
    | undefined
  >;
  selectedMsRef: MutableRefObject<number | undefined>;
}

export function useVisibleRangeSubscribers({
  rangeRef,
  selectedMsRef,
}: UseVisibleRangeSubscribersProps) {
  const rangeSubscribersRef = useRef<
    Map<
      string,
      {
        onVisibleRangeChange: RangeChangeHandler;
        onSelectedMsChange?: RangeChangeHandler;
        onWorldRangeChange?: RangeChangeHandler;
      }
    >
  >(new Map());

  return useMemo(() => {
    const broadcastVisibleRangeChange = () => {
      if (!rangeRef.current) return;
      for (const {
        onVisibleRangeChange,
      } of rangeSubscribersRef.current.values()) {
        onVisibleRangeChange(
          rangeRef.current.visibleRangeMs,
          [0, rangeRef.current.worldEndMs],
          selectedMsRef.current,
        );
      }
    };

    const broadcastSelectedMsChange = () => {
      if (!rangeRef.current) return;
      for (const {
        onSelectedMsChange,
      } of rangeSubscribersRef.current.values()) {
        onSelectedMsChange?.(
          rangeRef.current.visibleRangeMs,
          [0, rangeRef.current.worldEndMs],
          selectedMsRef.current,
        );
      }
    };

    const broadcastWorldRangeChange = () => {
      if (!rangeRef.current) return;
      for (const {
        onWorldRangeChange,
      } of rangeSubscribersRef.current.values()) {
        onWorldRangeChange?.(
          rangeRef.current.visibleRangeMs,
          [0, rangeRef.current.worldEndMs],
          selectedMsRef.current,
        );
      }
    };

    const subscribeRangeChange: RangeChangeSubscriberProps["subscribeRangeChange"] =
      (
        chartId,
        onVisibleRangeChange,
        onSelectedMsChange,
        onWorldRangeChange,
      ) => {
        rangeSubscribersRef.current.set(chartId, {
          onVisibleRangeChange,
          onSelectedMsChange,
          onWorldRangeChange,
        });
        if (!rangeRef.current) return;
        onVisibleRangeChange(
          rangeRef.current.visibleRangeMs,
          [0, rangeRef.current.worldEndMs],
          selectedMsRef.current,
        );

        return () => rangeSubscribersRef.current.delete(chartId);
      };

    const getAbsoluteNs = (relativeMs: number) => {
      if (!rangeRef.current) return 0n;
      return calcAbsoluteNs(rangeRef.current.referenceNs, relativeMs);
    };

    const getRelativeMs = (absoluteNs: bigint) => {
      if (!rangeRef.current) return 0;
      return calcRelativeMs(rangeRef.current.referenceNs, absoluteNs);
    };

    const visibleRangeSubscriberProps: RangeChangeSubscriberProps = {
      subscribeRangeChange,
      getAbsoluteNs,
      getRelativeMs,
    };

    return {
      broadcastVisibleRangeChange,
      broadcastSelectedMsChange,
      broadcastWorldRangeChange,
      visibleRangeSubscriberProps,
    };
  }, [rangeRef, selectedMsRef]);
}
