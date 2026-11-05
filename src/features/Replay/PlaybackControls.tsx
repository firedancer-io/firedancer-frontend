import { Flex, IconButton, Select, Tooltip } from "@radix-ui/themes";
import { PauseIcon, PlayIcon } from "@radix-ui/react-icons";
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

  useHotkey(" ", (e) => {
    // don't trigger on focused controls like buttons
    if ((e.target as HTMLElement | null)?.closest('button, [role="listbox"]')) {
      return;
    }
    e.preventDefault();
    togglePlayback();
  });

  const isRunning = isLive || isPlaying;

  return (
    <Flex align="center" gap="2">
      <Tooltip content={isRunning ? "Pause (Space)" : "Play (Space)"}>
        <IconButton
          size="1"
          variant="soft"
          color="gray"
          aria-label={isRunning ? "Pause" : "Play"}
          onClick={() => togglePlayback()}
        >
          {isRunning ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
      </Tooltip>
      <Select.Root
        size="1"
        value={String(playbackRate)}
        onValueChange={(value) =>
          setPlaybackRate(Number(value) as PlaybackRate)
        }
      >
        <Select.Trigger
          variant="soft"
          color="gray"
          aria-label="Playback speed"
        />
        <Select.Content>
          {playbackRates.map((rate) => (
            <Select.Item
              key={rate}
              value={String(rate)}
              disabled={isLive && rate > 1}
            >
              {rate}×
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Flex>
  );
}
