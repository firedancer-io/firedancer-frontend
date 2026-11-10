import { Link } from "@tanstack/react-router";
import { Text } from "@radix-ui/themes";
import styles from "./slotText.module.css";
import clsx from "clsx";
import CopyButton from "../../../components/CopyButton";
import ReplayLink from "../../Replay/ReplayLink";

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
        ) : replayCenterNs != null ? (
          <ReplayLink
            getTarget={() => ({ slot, centerNs: replayCenterNs })}
            className={styles.replayLink}
          >
            {slot}
          </ReplayLink>
        ) : (
          slot
        )}
      </Text>
    </CopyButton>
  );
}
