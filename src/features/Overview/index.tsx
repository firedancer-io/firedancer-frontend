import { Flex } from "@radix-ui/themes";
import TransactionsCard from "./TransactionsCard";
import SlotPerformance from "./SlotPerformance";
import styles from "./overview.module.css";
import { useAtomValue, useSetAtom } from "jotai";
import { epochAtom, slotOverrideAtom } from "../../atoms";
import ValidatorsCard from "./ValidatorsCard";
import SlotStatusCard from "./StatusCard";
import ComputeUnitsCard from "./SlotPerformance/ComputeUnitsCard";
import { useSlotSearchParam } from "./useSearchParams";
import { useEffect, useRef } from "react";
import { selectedSlotAtom } from "./SlotPerformance/atoms";

export default function Overview() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const resizeCards = () => {
      if (!ref.current) return;
      const children = Array.from(ref.current.children) as HTMLElement[];
      if (children.length === 0) return;

      let isVerticallyStacked = true;
      for (let i = 1; i < children.length; i++) {
        if (children[i].offsetTop <= children[i - 1].offsetTop) {
          isVerticallyStacked = false;
          break;
        }
      }

      if (isVerticallyStacked) {
        ref.current.classList.add(styles.flexGrowChildren);
      } else {
        ref.current.classList.remove(styles.flexGrowChildren);
      }
    };
    window.addEventListener("resize", resizeCards);
    resizeCards();
    return () => window.removeEventListener("resize", resizeCards);
  }, []);

  return (
    <Flex
      direction="column"
      gap="4"
      className={styles.container}
      align="stretch"
    >
      <Setup />
      <div ref={ref} className={styles.cardContainer}>
        <SlotStatusCard />
        <TransactionsCard />
        <ValidatorsCard />
      </div>
      <SlotPerformance />
      <ComputeUnitsCard />
    </Flex>
  );
}

function Setup() {
  const { selectedSlot } = useSlotSearchParam();
  const setSelectedSlotAtom = useSetAtom(selectedSlotAtom);
  const setSlotOverride = useSetAtom(slotOverrideAtom);
  const epoch = useAtomValue(epochAtom);

  useEffect(() => {
    // To initially sync atom to search param
    setSelectedSlotAtom(selectedSlot);
  }, [selectedSlot, setSelectedSlotAtom]);

  useEffect(() => {
    // To set the epoch bar / slot selector positions on mount from search param
    setSlotOverride(selectedSlot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, setSlotOverride]);

  return null;
}
