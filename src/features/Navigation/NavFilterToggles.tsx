import { Flex, Text } from "@radix-ui/themes";
import { ToggleGroup } from "radix-ui";
import { useCallback } from "react";

import { useAtom } from "jotai";
import { SlotNavFilter, slotNavFilterAtom } from "../../atoms";
import styles from "./navigation.module.css";

export default function NavFilterToggles() {
  const [navFilter, setNavFilter] = useAtom(slotNavFilterAtom);

  const onValueChange = useCallback(
    (value: SlotNavFilter) => {
      if (!value) return;

      setNavFilter(value);
    },
    [setNavFilter],
  );

  return (
    <Flex width="100%">
      <ToggleGroup.Root
        type="single"
        value={navFilter}
        aria-label="Slots List Toggle"
        onValueChange={onValueChange}
        className={styles.navFilterToggleGroup}
      >
        <ToggleGroup.Item
          value={SlotNavFilter.AllSlots}
          aria-label="All Slots toggle"
        >
          <Text>All Slots</Text>
        </ToggleGroup.Item>

        <ToggleGroup.Item
          value={SlotNavFilter.MySlots}
          aria-label="My Slots toggle"
        >
          <Text>My Slots</Text>
        </ToggleGroup.Item>
      </ToggleGroup.Root>
    </Flex>
  );
}
