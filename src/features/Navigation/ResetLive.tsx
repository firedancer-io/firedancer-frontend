import { useAtomValue, useSetAtom } from "jotai";
import { slotOverrideAtom, statusAtom } from "../../atoms";
import styles from "./resetLive.module.css";
import { Button, Text } from "@radix-ui/themes";
import { ArrowDownIcon, ArrowUpIcon } from "@radix-ui/react-icons";

export default function ResetLive() {
  const setSlotOverride = useSetAtom(slotOverrideAtom);
  const status = useAtomValue(statusAtom);

  if (status === "Live") return null;

  return (
    <div className={styles.container}>
      <Button
        className={styles.button}
        style={{
          zIndex: 3,
        }}
        onClick={() => {
          setSlotOverride(undefined);
        }}
      >
        <Text>Skip to RT</Text>
        {status === "Past" ? <ArrowUpIcon /> : <ArrowDownIcon />}
      </Button>
    </div>
  );
}
