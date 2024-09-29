import { atom, useAtomValue, useSetAtom } from "jotai";
import styles from "./epochBarLive.module.css";
import { Button, Flex, Reset, Text, Tooltip } from "@radix-ui/themes";
import liveIconGreen from "../../assets/fiber_manual_record_16dp_3CFF73_FILL1_wght400_GRAD0_opsz20.svg";
import historyIcon from "../../assets/history.svg";
import futureIcon from "../../assets/future.svg";
import undoIcon from "../../assets/undo.svg";
import redoIcon from "../../assets/redo.svg";
import { currentSlotAtom, slotOverrideAtom } from "../../atoms";

const epochBarStatusAtom = atom((get) => {
  const currentSlot = get(currentSlotAtom);
  if (currentSlot === undefined) return;

  const slotOverride = get(slotOverrideAtom);
  if (slotOverride === undefined) return "Live";
  if (slotOverride > currentSlot) return "Future";
  if (slotOverride < currentSlot) return "Past";
  return "Live";
});

export default function EpochBarLive() {
  return (
    <Flex style={{ zIndex: 1 }}>
      <EpochStatusIndicator />
      <ResetToNow />
    </Flex>
  );
}

function EpochStatusIndicator() {
  const status = useAtomValue(epochBarStatusAtom);

  if (status === undefined) return null;

  if (status === "Past")
    return (
      <Tooltip
        content="Epoch timeline is focused on a past slot"
        disableHoverableContent
      >
        <Flex align="center" className={styles.notLive} gap="1">
          <img src={historyIcon} alt={status} style={{ height: "16px" }} />
          <Text>{status}</Text>
        </Flex>
      </Tooltip>
    );

  if (status === "Future")
    return (
      <Tooltip
        content="Epoch timeline is focused on a future slot"
        disableHoverableContent
      >
        <Flex align="center" className={styles.notLive} gap="1">
          <img src={futureIcon} alt={status} style={{ height: "16px" }} />
          <Text>{status}</Text>
        </Flex>
      </Tooltip>
    );

  return (
    <Tooltip
      content="Epoch timeline is realtime, following the current leader slot"
      disableHoverableContent
    >
      <Flex align="center" gap="1">
        <img src={liveIconGreen} alt="live icon" style={{ height: "16px" }} />
        <Text style={{ color: "var(--green-live)" }}>Realtime</Text>
      </Flex>
    </Tooltip>
  );
}

function ResetToNow() {
  const status = useAtomValue(epochBarStatusAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);

  if (status === "Live") return null;

  return (
    <Tooltip content="Reset epoch timeline to follow current leader slot">
      <Reset>
        <Button
          className={styles.reset}
          onClick={() => setSlotOverride(undefined)}
        >
          <Text>Resume realtime</Text>
          <img src={status === "Future" ? undoIcon : redoIcon} alt={status} />
        </Button>
      </Reset>
    </Tooltip>
  );
}
