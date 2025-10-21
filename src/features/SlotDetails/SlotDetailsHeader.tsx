import { Flex, Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { selectedSlotAtom } from "../Overview/SlotPerformance/atoms";
import { useSlotInfo } from "../../hooks/useSlotInfo";
import styles from "./slotDetailsHeader.module.css";
import PeerIcon from "../../components/PeerIcon";
import SlotClient from "../../components/SlotClient";

export default function SlotDetailsHeader() {
  const slot = useAtomValue(selectedSlotAtom) ?? -1;
  const { peer, isLeader, name } = useSlotInfo(slot);

  return (
    <Flex
      gap="3"
      wrap="wrap"
      className={styles.header}
      align="center"
      justify="start"
    >
      <PeerIcon url={peer?.info?.icon_url} size={22} isYou={isLeader} />
      <Text className={styles.slotName}>{name}</Text>
      <Flex gap="1">
        <SlotClient slot={slot} size="large" />
      </Flex>
    </Flex>
  );
}
