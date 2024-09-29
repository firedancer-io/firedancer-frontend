import { Box, Card, Flex } from "@radix-ui/themes";
import CardStat from "../../../components/CardStat";
import CardHeader from "../../../components/CardHeader";
import Chart from "./Chart";

export default function VotePerformanceCard() {
  return (
    <Card>
      <Flex direction="column" height="100%">
        <CardHeader text="Validators" />
        <Flex gap="4" flexGrow="1">
          <Flex direction="column">
            <CardStat
              label="Current Weight"
              value={(4.3).toLocaleString()}
              valueColor="#7C8D1D"
              appendValue="%"
            />
            <CardStat
              label="Max Credit Weight"
              value={(5.5).toLocaleString()}
              valueColor="
              #7FD44B"
              appendValue="%"
            />
            <CardStat
              label="Min Credit Weight"
              value={(3.7).toLocaleString()}
              valueColor="#913517"
              appendValue="%"
            />
          </Flex>
          <Box flexGrow="1" style={{ margin: "12px" }}>
            <Chart />
          </Box>
        </Flex>
      </Flex>
    </Card>
  );
}
