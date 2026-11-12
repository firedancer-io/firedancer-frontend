import { Box, Flex } from "@radix-ui/themes";
import Chart from "./Chart";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useMeasure } from "react-use";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isWebgl2SupportedAtom } from "../WebGl/atoms";
import {
  isFullScreenAtom,
  miniMapPopoverBoundaryElAtom,
  miniMapPopoverBoundaryWidthAtom,
} from "./atoms";
import ReplayControls from "./ReplayControls";
import { useDismissSelection, useHoveredSlotClearDelay } from "./slotHighlight";

export default function Replay() {
  const isWebGl2Supported = useAtomValue(isWebgl2SupportedAtom);
  const [isFullScreen, setIsFullScreen] = useAtom(isFullScreenAtom);
  const replayRef = useRef<HTMLDivElement>(null);
  useDismissSelection(replayRef);
  useHoveredSlotClearDelay();

  useEffect(() => () => setIsFullScreen(false), [setIsFullScreen]);

  return (
    <Flex
      ref={replayRef}
      direction="column"
      gap="3px"
      // keep the controls off the top edge of the screen in full screen
      pt={isFullScreen ? "3px" : undefined}
      flexGrow="1"
      minHeight="0"
    >
      <Flex align="center" gap="2">
        <ReplayControls />
        <MiniMapPopoverBoundary />
      </Flex>
      {isWebGl2Supported ? <Chart /> : <div>WebGL2 support required</div>}
    </Flex>
  );
}

function MiniMapPopoverBoundary() {
  const setBoundaryEl = useSetAtom(miniMapPopoverBoundaryElAtom);
  const setBoundaryWidth = useSetAtom(miniMapPopoverBoundaryWidthAtom);
  const [measureRef, { width }] = useMeasure<HTMLDivElement>();

  useLayoutEffect(() => setBoundaryWidth(width), [setBoundaryWidth, width]);

  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      setBoundaryEl(el);
      if (el) measureRef(el);
      else setBoundaryWidth(0);
    },
    [setBoundaryEl, measureRef, setBoundaryWidth],
  );

  return <Box ref={ref} flexGrow="1" />;
}
