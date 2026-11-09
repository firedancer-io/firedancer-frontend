import { Link } from "@tanstack/react-router";
import { Text } from "@radix-ui/themes";
import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import styles from "./slotText.module.css";
import clsx from "clsx";
import CopyButton from "../../../components/CopyButton";
import {
  navigateToReplaySlotAtom,
  isInitializedAtom,
} from "../../Replay/atoms";

interface LinkedSlotTextProps {
  slot: number;
  isLeader: boolean;
  replayCenterNs?: bigint;
  className?: string;
}

export default function LinkedSlotText({
  slot,
  isLeader,
  replayCenterNs,
  className,
}: LinkedSlotTextProps) {
  const isReplayInitialized = useAtomValue(isInitializedAtom);
  const navigateToReplaySlot = useSetAtom(navigateToReplaySlotAtom);

  const onClick = useCallback(() => {
    if (replayCenterNs == null) return;
    navigateToReplaySlot(slot, replayCenterNs);
  }, [navigateToReplaySlot, slot, replayCenterNs]);

  return (
    <CopyButton
      className={styles.copyButton}
      value={String(slot)}
      hideIconUntilHover
      copyOnIconOnly
    >
      <Text className={clsx(className, styles.slotText)}>
        {isLeader ? (
          <Link to="/slotDetails" search={{ slot }} draggable={false}>
            {slot}
          </Link>
        ) : replayCenterNs != null && isReplayInitialized ? (
          <Link
            to="/replay"
            draggable={false}
            onClick={onClick}
            className={styles.replayLink}
          >
            {slot}
          </Link>
        ) : (
          slot
        )}
      </Text>
    </CopyButton>
  );
}
