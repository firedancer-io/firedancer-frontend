import { Flex } from "@radix-ui/themes";

import { CatchingUpBars } from "./CatchingUpBars";

import { BarsFooter } from "./BarsFooter";
import BarsLabels from "./BarsLabels";
import { useAtomValue, useSetAtom } from "jotai";
import { catchingUpContainerElAtom, hasCatchingUpDataAtom } from "./atoms";

export default function CatchingUp() {
  const setContainerEl = useSetAtom(catchingUpContainerElAtom);
  const hasCatchingUpData = useAtomValue(hasCatchingUpDataAtom);
  if (!hasCatchingUpData) return;

  return (
    <Flex ref={setContainerEl} direction="column" gap="5px">
      <BarsLabels />
      <CatchingUpBars />
      <BarsFooter />
    </Flex>
  );
}
