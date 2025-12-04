import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { useAtomValue } from "jotai";
import { ClientEnum } from "../../../api/entities";
import { clientAtom } from "../../../atoms";
import ShredsChart from "./ShredsChart";
import { ShredsChartLegend } from "./ShredsChartLegend";

export default function ShredsProgression() {
  const client = useAtomValue(clientAtom);

  if (client !== ClientEnum.Firedancer) return;

  return (
    // extra right padding for x axis label
    <Card style={{ padding: "10px 13px 10px 10px" }}>
      <Flex direction="column" gap="4">
        <Flex gapX="15px" gapY="2" align="center" wrap="wrap">
          <CardHeader text="Shreds" />
          <ShredsChartLegend />
        </Flex>
        <ShredsChart
          height="400px"
          chartId="overview-shreds-chart"
          isOnStartupScreen={false}
        />
      </Flex>
    </Card>
  );
}
