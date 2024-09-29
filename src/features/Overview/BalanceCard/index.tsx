import { Box, Flex } from "@radix-ui/themes";
import CardHeader from "../../../components/CardHeader";
import Card from "../../../components/Card";
import CardStat from "../../../components/CardStat";
import Chart from "./Chart";
import { useAtomValue } from "jotai";
import { balanceAtom } from "../../../api/atoms";
import { lamportsPerSlot, lamportsPerSol } from "../../../consts";
import { currentLeaderSlotAtom, epochAtom } from "../../../atoms";

export default function BalanceCard() {
  const epoch = useAtomValue(epochAtom);
  const currentSlot = useAtomValue(currentLeaderSlotAtom);
  const currentBalance = useAtomValue(balanceAtom);

  if (!epoch || !currentSlot || currentBalance === undefined) return null;

  const startingBalance =
    (currentSlot - epoch.start_slot) * lamportsPerSlot + currentBalance;
  const endingBalance =
    currentBalance - (epoch.end_slot - currentSlot) * lamportsPerSlot;

  const hide = currentSlot < epoch.start_slot || currentSlot > epoch.end_slot;

  return (
    <Card hideChildren={hide}>
      <Flex direction="column" height="100%">
        <CardHeader text="Balance" />
        <Flex gap="4" flexGrow="1">
          <Flex direction="column">
            <CardStat
              label="Starting"
              value={(startingBalance / lamportsPerSol).toLocaleString()}
              valueColor="#296BB6"
              appendValue="SOL"
            />
            <CardStat
              label="Current"
              value={(currentBalance / lamportsPerSol).toLocaleString()}
              valueColor="#7DCEE0"
              appendValue="SOL"
            />
            <CardStat
              label="Ending"
              value={(endingBalance / lamportsPerSol).toLocaleString()}
              valueColor="#FF3C3C"
              appendValue="SOL"
            />
          </Flex>
          <Box flexGrow="1" style={{ margin: "12px 0" }}>
            <Chart
              startingBalance={startingBalance}
              currentBalance={currentBalance}
              endingBalance={endingBalance}
              startSlot={epoch.start_slot}
              currentSlot={currentSlot}
              endSlot={epoch.end_slot}
            />
          </Box>
        </Flex>
      </Flex>
    </Card>
  );
}
