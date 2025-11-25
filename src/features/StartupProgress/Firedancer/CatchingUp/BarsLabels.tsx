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
} from "./atoms";
import { useEffect } from "react";

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

  return (
    <Flex className={styles.labelsRow}>
      <Flex justify="end" flexShrink="0" className={styles.labelsLeft}>
        <TurbineLabel slot={firstTurbineSlot} />
      </Flex>

      <Flex
        justify="end"
        flexGrow="1"
        minWidth="0"
        className={styles.labelsRight}
      >
        <TurbineLabel slot={latestTurbineSlot} isHead />
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
