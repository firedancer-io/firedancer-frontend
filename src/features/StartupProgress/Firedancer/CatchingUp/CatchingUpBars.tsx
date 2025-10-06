import { useRef, useMemo, useCallback, useEffect } from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import UplotReact from "../../../../uplotReact/UplotReact";
import type { CatchingUpData } from "./atoms";
import {
  catchingUpStartSlotAtom,
  firstTurbineSlotAtom,
  latestTurbineSlotAtom,
  repairSlotsAtom,
  turbineSlotsAtom,
} from "./atoms";
import { useAtomValue } from "jotai";
import { catchingUpBarsPlugin } from "./catchingUpBarsPlugin";
import useEstimateTotalSlots from "./useEstimateTotalSlots";
import { Box } from "@radix-ui/themes";
import { useThrottledCallback } from "use-debounce";
import { completedSlotAtom } from "../../../../api/atoms";

const emptyChartData: uPlot.AlignedData = [[0], [null]];

export function CatchingUpBars() {
  const startSlot = useAtomValue(catchingUpStartSlotAtom);
  const repairSlots = useAtomValue(repairSlotsAtom);
  const turbineSlots = useAtomValue(turbineSlotsAtom);
  const firstTurbineSlot = useAtomValue(firstTurbineSlotAtom);
  const latestTurbineSlot = useAtomValue(latestTurbineSlotAtom);
  const latestReplaySlot = useAtomValue(completedSlotAtom);

  const dataRef = useRef<CatchingUpData | undefined>();
  const uplotRef = useRef<uPlot>();
  const totalSlotsRef = useEstimateTotalSlots();

  const options = useMemo<uPlot.Options>(() => {
    return {
      width: 0,
      height: 0,
      scales: { x: { time: false } },
      axes: [{ show: false }, { show: false }],
      series: [{}, { points: { show: false } }],
      cursor: {
        x: false,
        y: false,
      },
      legend: { show: false },

      plugins: [catchingUpBarsPlugin(totalSlotsRef, dataRef)],
    };
  }, [dataRef, totalSlotsRef]);

  const handleCreate = useCallback((u: uPlot) => {
    uplotRef.current = u;
  }, []);

  // throttle redraw on interval
  const redraw = useCallback((data: CatchingUpData) => {
    dataRef.current = data;
    uplotRef.current?.redraw();
  }, []);
  const throttledRedraw = useThrottledCallback(redraw, 100, {
    trailing: true,
  });

  useEffect(() => {
    if (
      startSlot == null ||
      !turbineSlots.size ||
      firstTurbineSlot == null ||
      latestTurbineSlot == null
    ) {
      return;
    }

    throttledRedraw({
      startSlot,
      repairSlots,
      turbineSlots,
      firstTurbineSlot,
      latestTurbineSlot,
      latestReplaySlot,
    });
  }, [
    firstTurbineSlot,
    latestReplaySlot,
    latestTurbineSlot,
    repairSlots,
    startSlot,
    throttledRedraw,
    turbineSlots,
  ]);

  if (
    startSlot == null ||
    !turbineSlots.size ||
    firstTurbineSlot == null ||
    latestTurbineSlot == null
  ) {
    return;
  }

  return (
    <Box height="77px">
      <AutoSizer>
        {({ height, width }) => {
          options.width = width;
          options.height = height;

          return (
            <UplotReact
              id="catching-up-slot-bars"
              options={options}
              data={emptyChartData}
              onCreate={handleCreate}
            />
          );
        }}
      </AutoSizer>
    </Box>
  );
}
