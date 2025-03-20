import { useSetAtom } from "jotai";
import { slotOverrideAtom } from "../../../atoms";
import styles from "./resetLive.module.css";
import { Button } from "@radix-ui/themes";
import { useSlotSearchParam } from "../useSearchParams";

export default function ResetLive() {
  const setSlotOverride = useSetAtom(slotOverrideAtom);
  const { selectedSlot, setSelectedSlot } = useSlotSearchParam();

  if (!selectedSlot) return null;

  return (
    <div className={styles.container}>
      <Button
        className={styles.button}
        style={{
          zIndex: 3,
        }}
        onClick={() => {
          setSlotOverride(undefined);
          setSelectedSlot(undefined);
        }}
      >
        Skip to Now
      </Button>
    </div>
  );
}
