import { Flex } from "@radix-ui/themes";
import Grid from "./Grid";

export default function Gossip() {
  return (
    <Flex
      direction="column"
      gap="4"
      style={{ padding: "4px 12px" }}
      height="calc(100vh - var(--header-height))"
    >
      <Grid />
    </Flex>
  );
}
