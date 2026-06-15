import { Flex, IconButton, Text } from "@radix-ui/themes";
import { GearIcon } from "@radix-ui/react-icons";
import { useAtom } from "jotai";
import PopoverDropdown from "../../components/PopoverDropdown";
import ToggleControl from "../../components/ToggleControl";
import { animateNumbersAtom } from "../../settingsAtoms";

/** Header gear popover for display preferences. */
export default function DisplaySettings() {
  const [animateNumbers, setAnimateNumbers] = useAtom(animateNumbersAtom);

  return (
    <PopoverDropdown
      align="end"
      content={
        <Flex direction="column" gap="2" p="1">
          <Text size="2" weight="bold">
            Display
          </Text>
          <ToggleControl
            label="Animate changing numbers"
            checked={animateNumbers}
            onCheckedChange={setAnimateNumbers}
          />
        </Flex>
      }
    >
      <IconButton variant="ghost" color="gray" aria-label="Display settings">
        <GearIcon />
      </IconButton>
    </PopoverDropdown>
  );
}
