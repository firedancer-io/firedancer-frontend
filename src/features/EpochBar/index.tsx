import { Flex, Text } from "@radix-ui/themes";
import EpochBarLive from "./EpochBarLive";
import EpochSlider from "./EpochSlider";
import NavigateNext from "./NavigateNext";
import NavigatePrev from "./NavigatePrev";
import EpochBounds from "./EpochBounds";
import { useAtomValue } from "jotai";
import { epochAtom } from "../../atoms";

interface EpochBarProps {
  canMove?: boolean;
}

export default function EpochBar({ canMove = true }: EpochBarProps) {
  return (
    <Flex direction="column" gap="1">
      <Flex align="center" gap="3">
        <EpochText />
        <EpochBarLive />
      </Flex>
      <Flex align="center" justify="between" gap="2">
        <NavigatePrev />
        <EpochSlider canChange={canMove} />
        <NavigateNext />
      </Flex>
      <EpochBounds />
    </Flex>
  );
}

function EpochText() {
  const epoch = useAtomValue(epochAtom);

  return (
    <Text style={{ color: "#FAFAFA" }} weight="medium">
      Epoch {!!epoch && epoch.epoch}
    </Text>
  );
}
