import { Flex, Text } from "@radix-ui/themes";

/**
 * TODO: add aggregate tile states querying `query_agg_tile_states`
 */
export default function AggTileStates() {
  return (
    <Flex position="absolute" inset="0" align="center" justify="center">
      <Text size="1" color="gray">
        Please zoom in to see tile state data
      </Text>
    </Flex>
  );
}
