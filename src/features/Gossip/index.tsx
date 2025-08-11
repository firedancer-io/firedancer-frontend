import { Flex } from "@radix-ui/themes";
import Grid from "./Grid";

export default function Gossip() {
  return (
    <Flex direction="column" gap="4" flexGrow="1" flexShrink="1" height="100%">
      <Grid />
    </Flex>
  );
}
