import { Box, Card, Flex, Text } from "@radix-ui/themes";
import CardHeader from "../../components/CardHeader";
import { Bar } from "@nivo/bar";
import AutoSizer from "react-virtualized-auto-sizer";

const data = new Array(10).fill(0).map((_, i) => {
  return {
    value: Math.random() * 2 + 10,
    id: i,
  };
});

export default function EarningsCard() {
  return (
    <Card>
      <Flex direction="column" gap="1" height="100%">
        <CardHeader text="My Earnings (this epoch vs 30D)" />
        <Flex flexGrow="1">
          <Flex direction="column">
            <Flex direction="column">
              <CardHeader text="Projected"></CardHeader>
              <Flex align="end" gap="2">
                <Text size="7" weight="medium">
                  0.143
                </Text>
                <Text>SOL</Text>
              </Flex>
            </Flex>
            <Flex direction="column">
              <Text>Non-Vote</Text>
              <Flex align="end" gap="2">
                <Text size="7" weight="medium">
                  0.491
                </Text>
                <Text>SOL</Text>
              </Flex>
            </Flex>
            <Flex direction="column">
              <Text>Avgerage (30d)</Text>
              <Text size="3" weight="medium">
                0.592 SOL
              </Text>
            </Flex>
          </Flex>
          <Box flexGrow="1">
            <Chart />
          </Box>
        </Flex>
      </Flex>
    </Card>
  );
}

function Chart() {
  return (
    <AutoSizer>
      {({ height, width }) => {
        return (
          <Bar height={height} width={width} data={data} enableLabel={false} />
        );
      }}
    </AutoSizer>
  );
}
