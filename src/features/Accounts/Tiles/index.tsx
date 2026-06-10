import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { accountsStatsAtom } from "../../../api/atoms";
import { useAtomValue } from "jotai";

export default function CacheClasses() {
  const accountStats = useAtomValue(accountsStatsAtom);
  if (!accountStats) return;

  return (
    <Card>
      <Flex direction="column" gap="7px">
        <Flex gap="5px">
          <CardHeader text="Tiles" />
        </Flex>
      </Flex>
    </Card>
  );
}
