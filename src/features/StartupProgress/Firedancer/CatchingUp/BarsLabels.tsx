import { Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import styles from "./catchingUp.module.css";
import clsx from "clsx";
import { useMeasure } from "react-use";
import {
  catchingUpContainerElAtom,
  catchingUpStartSlotAtom,
  firstTurbineSlotAtom,
  latestTurbineSlotAtom,
  repairSlotsAtom,
  turbineSlotsAtom,
} from "./atoms";
import { useEffect } from "react";
import { completedSlotAtom } from "../../../../api/atoms";

export default function BarsLabels() {
  const startSlot = useAtomValue(catchingUpStartSlotAtom);
  const firstTurbineSlot = useAtomValue(firstTurbineSlotAtom);
  const latestTurbineSlot = useAtomValue(latestTurbineSlotAtom);

  if (
    startSlot == null ||
    firstTurbineSlot == null ||
    latestTurbineSlot == null
  ) {
    return;
  }

  const isLeftSectionWider =
    firstTurbineSlot - startSlot >= latestTurbineSlot - firstTurbineSlot;

  return (
    <Flex className={styles.labelsRow}>
      <Flex className={styles.leftLabels}>
        {isLeftSectionWider && <EquationLabels />}
        <TurbineLabel slot={firstTurbineSlot} />
      </Flex>

      <Flex className={styles.rightLabels}>
        {!isLeftSectionWider && <EquationLabels />}
        <TurbineLabel slot={latestTurbineSlot} isHead />
      </Flex>
    </Flex>
  );
}

interface SlotLabelProps {
  value: number;
  label: string;
  className: string;
}
function SlotLabel({ value, label, className }: SlotLabelProps) {
  return (
    <Text className={clsx(className, styles.ellipsis)}>
      <Text className={styles.bold}>{value} </Text>
      {label}
    </Text>
  );
}

function EquationLabels() {
  const startSlot = useAtomValue(catchingUpStartSlotAtom);
  const turbineSlots = useAtomValue(turbineSlotsAtom);
  const repairSlots = useAtomValue(repairSlotsAtom);
  const latestReplaySlot = useAtomValue(completedSlotAtom);

  if (startSlot == null || !turbineSlots.size) {
    return;
  }

  return (
    <Flex
      justify="center"
      flexGrow="1"
      minWidth="0"
      align="end"
      className={styles.equation}
    >
      <SlotLabel
        className={styles.replayed}
        value={latestReplaySlot ? latestReplaySlot - startSlot + 1 : 0}
        label="Slots Replayed"
      />

      <div className={styles.dynamicGap} />
      <Text> : </Text>
      <div className={styles.dynamicGap} />

      <Flex gap="2px" align="center" minWidth="0">
        <Text>( </Text>
        <SlotLabel
          className={styles.repaired}
          value={repairSlots.size}
          label="Repaired"
        />

        <Text> + </Text>

        <SlotLabel
          className={styles.receivedByTurbine}
          value={turbineSlots.size}
          label="Received by Turbine"
        />

        <Text> ) </Text>
      </Flex>
    </Flex>
  );
}

interface TurbineLabelProps {
  isHead?: boolean;
  slot: number;
}
function TurbineLabel({ isHead = false, slot }: TurbineLabelProps) {
  const containerEl = useAtomValue(catchingUpContainerElAtom);
  const [measureRef, { width }] = useMeasure<HTMLDivElement>();

  useEffect(() => {
    containerEl?.style.setProperty(
      isHead ? "--turbine-head-label-width" : "--turbine-start-label-width",
      `${width}px`,
    );
  }, [containerEl, isHead, width]);

  return (
    <Flex
      ref={measureRef}
      direction="column"
      className={clsx(styles.turbineLabel, isHead ? styles.head : styles.start)}
    >
      <Text className={styles.bold}>
        {isHead ? "Turbine Head" : "Turbine Start"}
      </Text>
      <Text>{slot}</Text>
    </Flex>
  );
}
