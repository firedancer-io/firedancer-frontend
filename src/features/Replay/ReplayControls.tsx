import { Tooltip } from "@radix-ui/themes";
import clsx from "clsx";
import { useAtom, useAtomValue } from "jotai";
import { isWebgl2SupportedAtom } from "../WebGl/atoms";
import { isFullScreenAtom } from "./atoms";
import PlaybackControls from "./PlaybackControls";
import { useHotkey } from "../../hooks/useHotkey";
import { FullScreenEnterIcon, FullScreenExitIcon } from "./controlIcons";
import styles from "./replayControls.module.css";

export default function ReplayControls() {
  const isWebGl2Supported = useAtomValue(isWebgl2SupportedAtom);
  const showFullScreen = document.fullscreenEnabled;
  if (!showFullScreen && !isWebGl2Supported) return null;

  return (
    <div className={styles.controls} role="group" aria-label="Replay controls">
      {showFullScreen && <FullScreenButton />}
      {isWebGl2Supported && <PlaybackControls />}
    </div>
  );
}

function FullScreenButton() {
  const [isFullScreen, setIsFullScreen] = useAtom(isFullScreenAtom);
  const label = isFullScreen ? "Exit full screen" : "Full screen";
  const Icon = isFullScreen ? FullScreenExitIcon : FullScreenEnterIcon;
  const toggleFullScreen = () => setIsFullScreen((v) => !v);

  useHotkey("f", toggleFullScreen);

  return (
    <Tooltip content={`${label} (F)`}>
      <button
        type="button"
        className={clsx(styles.button, styles.iconButton)}
        aria-label={label}
        onClick={toggleFullScreen}
      >
        <Icon />
      </button>
    </Tooltip>
  );
}
