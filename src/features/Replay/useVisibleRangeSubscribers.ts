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
  const visibleRangeSubscribersRef = useRef<
    Map<
      string,
      {
        onRangeChange: RangeChangeHandler;
        onSelectedMsChange?: RangeChangeHandler;
      }
    >
  >(new Map());

  return useMemo(() => {
    const broadcastVisibleRangeChange = () => {
      if (!rangeRef.current) return;
      for (const {
        onRangeChange,
      } of visibleRangeSubscribersRef.current.values()) {
        onRangeChange(
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
      } of visibleRangeSubscribersRef.current.values()) {
        onSelectedMsChange?.(
          rangeRef.current.visibleRangeMs,
          [0, rangeRef.current.worldEndMs],
          selectedMsRef.current,
        );
      }
    };

    const subscribeRangeChange: RangeChangeSubscriberProps["subscribeRangeChange"] =
      (chartId, onRangeChange, onSelectedMsChange) => {
        visibleRangeSubscribersRef.current.set(chartId, {
          onRangeChange,
          onSelectedMsChange,
        });
        if (!rangeRef.current) return;
        onRangeChange(
          rangeRef.current.visibleRangeMs,
          [0, rangeRef.current.worldEndMs],
          selectedMsRef.current,
        );

        return () => visibleRangeSubscribersRef.current.delete(chartId);
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
      visibleRangeSubscriberProps,
    };
  }, [rangeRef, selectedMsRef]);
}
