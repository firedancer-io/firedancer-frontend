import { Flex, IconButton, Text } from "@radix-ui/themes";
import { EnterFullScreenIcon, ExitFullScreenIcon } from "@radix-ui/react-icons";
import Chart from "./Chart";
import { useEffect, useRef } from "react";
import { useHotkey } from "../../hooks/useHotkey";
import { useAtom, useAtomValue } from "jotai";
import { isWebgl2SupportedAtom } from "../WebGl/atoms";
import { isFullScreenAtom } from "./atoms";
import PlaybackControls from "./PlaybackControls";
import styles from "./replay.module.css";
import { useDismissSelection } from "./slotHighlight";

export default function Replay() {
  const isWebGl2Supported = useAtomValue(isWebgl2SupportedAtom);
  const [isFullScreen, setIsFullScreen] = useAtom(isFullScreenAtom);
  const replayRef = useRef<HTMLDivElement>(null);
  useDismissSelection(replayRef);

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
        <Text className={styles.title}>Replay</Text>
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
      </Flex>
      {isWebGl2Supported ? <Chart /> : <div>WebGL2 support required</div>}
    </Flex>
  );
}
