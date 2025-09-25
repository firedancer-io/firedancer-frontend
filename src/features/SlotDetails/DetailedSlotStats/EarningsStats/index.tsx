import { Flex, Grid } from "@radix-ui/themes";
import { Section } from "../StatSection";
import RewardStats from "./RewardStats";
import TopIps from "./TopIps";
import TxnIncomePctChart from "../../TxnIncomePctChart";

export default function EarningsStats() {
  return (
    <Section title="Rewards">
      <Flex direction="column" gap="3">
        <Grid columns="repeat(2, auto) minmax(80px, 200px)" gapX="3" gapY="1">
          <RewardStats />
          <TopIps />
        </Grid>
        <TxnIncomePctChart />
      </Flex>
    </Section>
  );
}
