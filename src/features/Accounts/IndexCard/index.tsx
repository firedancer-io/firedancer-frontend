import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";
import Stat from "../Stat";
import { formatIndexCount } from "../../../utils";
import {
  accountsIndexUsedColor,
  accountsSecondaryColor,
} from "../../../colors";
import IndexPieChart from "./IndexPieChart";

const minWidth = "110px";

export default function IndexCard() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  const total = formatIndexCount(accountStats.disk.accounts_total);
  const capacity = formatIndexCount(accountStats.disk.accounts_capacity);

  return (
    <Card>
      <Flex direction="column" justify="between" height="100%">
        <CardHeader text="Index" />
        <Flex gap="16px">
          <Flex direction="column" gap="15px">
            <Stat
              value={total.value}
              size="lg"
              label="Used"
              color={accountsIndexUsedColor}
              suffix={total.unit}
              minWidth={minWidth}
            />
            <Stat
              value={capacity.value}
              label="Capacity"
              color={accountsSecondaryColor}
              suffix={capacity.unit}
              minWidth={minWidth}
            />
          </Flex>
          <IndexPieChart
            used={accountStats.disk.accounts_total}
            unused={Math.max(
              0,
              accountStats.disk.accounts_capacity -
                accountStats.disk.accounts_total,
            )}
          />
        </Flex>
      </Flex>
    </Card>
  );
}
