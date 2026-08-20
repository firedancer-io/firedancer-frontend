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
  const visibleRangeSubscribersRef = useRef<Map<string, RangeChangeHandler>>(
    new Map(),
  );

  return useMemo(() => {
    const broadcastVisibleRangeChange = () => {
      if (!rangeRef.current) return;
      for (const onRangeChange of visibleRangeSubscribersRef.current.values()) {
        onRangeChange(
          rangeRef.current.visibleRangeMs,
          [0, rangeRef.current.worldEndMs],
          selectedMsRef.current,
        );
      }
    };

    const subscribeRangeChange: RangeChangeSubscriberProps["subscribeRangeChange"] =
      (chartId, onRangeChange) => {
        visibleRangeSubscribersRef.current.set(chartId, onRangeChange);
        if (!rangeRef.current) return;
        onRangeChange(
          rangeRef.current.visibleRangeMs,
          [0, rangeRef.current.worldEndMs],
          selectedMsRef.current,
        );
      };

    const unsubscribeRangeChange: RangeChangeSubscriberProps["unsubscribeRangeChange"] =
      (chartId) => {
        visibleRangeSubscribersRef.current.delete(chartId);
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
      unsubscribeRangeChange,
      getAbsoluteNs,
      getRelativeMs,
    };

    return {
      broadcastVisibleRangeChange,
      visibleRangeSubscriberProps,
    };
  }, [rangeRef, selectedMsRef]);
}
