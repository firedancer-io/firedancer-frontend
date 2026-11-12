import { DropdownMenu, Tooltip } from "@radix-ui/themes";
import clsx from "clsx";
import { useAtomValue, useSetAtom } from "jotai";
import { useUnmount } from "react-use";
import {
  isLiveAtom,
  isPlayingAtom,
  pauseAtom,
  playbackRateAtom,
  setPlaybackRateAtom,
  togglePlaybackAtom,
} from "./atoms";
import { playbackRates, type PlaybackRate } from "./const";
import { useHotkey } from "../../hooks/useHotkey";
import { CaretDownIcon, PauseIcon, PlayIcon } from "./controlIcons";
import styles from "./replayControls.module.css";

export default function PlaybackControls() {
  const isLive = useAtomValue(isLiveAtom);
  const isPlaying = useAtomValue(isPlayingAtom);
  const playbackRate = useAtomValue(playbackRateAtom);
  const togglePlayback = useSetAtom(togglePlaybackAtom);
  const setPlaybackRate = useSetAtom(setPlaybackRateAtom);
  const pause = useSetAtom(pauseAtom);

  useUnmount(() => {
    if (isPlaying) pause();
  });

  useHotkey(" ", () => togglePlayback());

  const isRunning = isLive || isPlaying;
  const PlaybackIcon = isRunning ? PauseIcon : PlayIcon;

  return (
    <>
      <Tooltip content={isRunning ? "Pause (Space)" : "Play (Space)"}>
        <button
          type="button"
          className={clsx(styles.button, styles.iconButton)}
          aria-label={isRunning ? "Pause" : "Play"}
          onClick={() => togglePlayback()}
        >
          <PlaybackIcon />
        </button>
      </Tooltip>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <button
            type="button"
            className={clsx(styles.button, styles.speedButton)}
            aria-label="Playback speed"
          >
            {playbackRate}×
            <CaretDownIcon className={styles.caret} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content size="1">
          <DropdownMenu.RadioGroup
            value={String(playbackRate)}
            onValueChange={(value) =>
              setPlaybackRate(Number(value) as PlaybackRate)
            }
          >
            {playbackRates.map((rate) => (
              <DropdownMenu.RadioItem
                key={rate}
                value={String(rate)}
                disabled={isLive && rate > 1}
              >
                {rate}×
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </>
  );
}
