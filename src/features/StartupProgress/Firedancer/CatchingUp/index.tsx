import { Flex } from "@radix-ui/themes";

import { CatchingUpBars } from "./CatchingUpBars";

import { BarsFooter } from "./BarsFooter";
import BarsLabels from "./BarsLabels";
import { useAtomValue, useSetAtom } from "jotai";
import { catchingUpContainerElAtom, hasCatchingUpDataAtom } from "./atoms";
import ShredsProgression from "../../../Overview/ShredsProgression";

const chartHeight = 280;

export default function CatchingUp() {
  const setContainerEl = useSetAtom(catchingUpContainerElAtom);
  const hasCatchingUpData = useAtomValue(hasCatchingUpDataAtom);
  if (!hasCatchingUpData) return;

  return (
    <Flex direction="column" gap="20px">
      <Flex ref={setContainerEl} direction="column" gap="5px">
        <BarsLabels />
        <CatchingUpBars />
        <BarsFooter />
      </Flex>

      <ShredsProgression
        title="Shreds before turbine start"
        chartHeight={chartHeight}
        drawOnlyBeforeFirstTurbine
        drawOnlyDots
      />
      <ShredsProgression
        title="Shreds from turbine start"
        chartHeight={chartHeight}
        drawOnlyDots
      />
    </Flex>
  );
}
