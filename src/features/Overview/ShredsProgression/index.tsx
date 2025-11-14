import { Box, Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import ShredsTiles from "./ShredsTiles";
import { useAtomValue } from "jotai";
import { ClientEnum } from "../../../api/entities";
import { clientAtom } from "../../../atoms";
import ShredsChart from "./ShredsChart";

export default function ShredsProgression() {
  const client = useAtomValue(clientAtom);

  if (client !== ClientEnum.Firedancer) return;

  return (
    <Card>
      <Flex direction="column" gap="4">
        <CardHeader text="Shreds" />
        <Box height="400px">
          <ShredsChart
            chartId="overview-shreds-chart"
            isOnStartupScreen={false}
          />
        </Box>
        <ShredsTiles />
      </Flex>
    </Card>
  );
}
