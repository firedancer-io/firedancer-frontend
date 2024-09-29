import { useAtom, useAtomValue } from "jotai";
import { currentLeaderSlotAtom, slotOverrideAtom } from "../../../atoms";
import styles from "./resetLive.module.css";
import arrowDown from "../../../assets/arrow_down.svg";
import arrowUp from "../../../assets/arrow_up.svg";
import { Button } from "@radix-ui/themes";
import { slotsPerLeader } from "../../../consts";
import { initUpcomingSlotCardCount } from "./SlotCardList";

export default function ResetLive() {
  const [slotOverride, setSlotOverride] = useAtom(slotOverrideAtom);
  const currentLeaderSlot = useAtomValue(currentLeaderSlotAtom);

  if (slotOverride === undefined || currentLeaderSlot === undefined)
    return null;

  const pastSlot =
    slotOverride <=
    currentLeaderSlot + initUpcomingSlotCardCount * slotsPerLeader;

  return (
    <div className={styles.container}>
      <Button
        className={styles.button}
        style={{
          bottom: pastSlot ? undefined : "8px",
        }}
        onClick={() => setSlotOverride(undefined)}
      >
        Skip to Now
        {pastSlot ? <img src={arrowUp} /> : <img src={arrowDown} />}
      </Button>
    </div>
  );
}
