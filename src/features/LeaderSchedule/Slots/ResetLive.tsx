import { useAtom, useAtomValue } from "jotai";
import { currentLeaderSlotAtom, slotOverrideAtom } from "../../../atoms";
import styles from "./resetLive.module.css";
import { Button, Text } from "@radix-ui/themes";
import { scheduleUpcomingSlotsCount, slotsPerLeader } from "../../../consts";
import { ArrowDownIcon, ArrowUpIcon } from "@radix-ui/react-icons";

export default function ResetLive() {
  const [slotOverride, setSlotOverride] = useAtom(slotOverrideAtom);
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);

  if (slotOverride === undefined || currentLeaderSlot === undefined)
    return null;

  const pastSlot =
    slotOverride <=
    currentLeaderSlot + scheduleUpcomingSlotsCount * slotsPerLeader;

  return (
    <div className={styles.container}>
      <Button
        className={styles.button}
        style={{
          bottom: pastSlot ? undefined : "8px",
        }}
        onClick={() => setSlotOverride(undefined)}
      >
        <Text>Skip to Realtime</Text>
        {pastSlot ? <ArrowUpIcon /> : <ArrowDownIcon />}
      </Button>
    </div>
  );
}
