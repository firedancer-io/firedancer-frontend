import { Box, Flex, IconButton } from "@radix-ui/themes";
import { EnterFullScreenIcon, ExitFullScreenIcon } from "@radix-ui/react-icons";
import Chart from "./Chart";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useMeasure } from "react-use";
import { useHotkey } from "../../hooks/useHotkey";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isWebgl2SupportedAtom } from "../WebGl/atoms";
import {
  isFullScreenAtom,
  miniMapPopoverBoundaryElAtom,
  miniMapPopoverBoundaryWidthAtom,
} from "./atoms";
import PlaybackControls from "./PlaybackControls";
import { useDismissSelection, useHoveredSlotClearDelay } from "./slotHighlight";

export default function Replay() {
  const isWebGl2Supported = useAtomValue(isWebgl2SupportedAtom);
  const [isFullScreen, setIsFullScreen] = useAtom(isFullScreenAtom);
  const replayRef = useRef<HTMLDivElement>(null);
  useDismissSelection(replayRef);
  useHoveredSlotClearDelay();

  useEffect(() => () => setIsFullScreen(false), [setIsFullScreen]);

  const toggleFullScreen = () => setIsFullScreen((v) => !v);

  useHotkey("f", toggleFullScreen);

  return (
    <Flex
      ref={replayRef}
      direction="column"
      gap="3px"
      flexGrow="1"
      minHeight="0"
    >
      <Flex align="center" gap="2">
        {document.fullscreenEnabled && (
          <IconButton
            size="1"
            variant="soft"
            color="gray"
            aria-label={isFullScreen ? "Exit full screen" : "Full screen"}
            onClick={toggleFullScreen}
          >
            {isFullScreen ? <ExitFullScreenIcon /> : <EnterFullScreenIcon />}
          </IconButton>
        )}
        {isWebGl2Supported && <PlaybackControls />}
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
