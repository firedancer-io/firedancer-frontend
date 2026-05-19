import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { accountsStatsAtom } from "../../api/atoms";
import { isFrankendancer } from "../../client";
import { StatCards } from "./StatCards";
import { CacheTable } from "./CacheTable";
import { TileTable } from "./TileTable";
import { PartitionTable } from "./PartitionTable";

export default function Accounts() {
  const stats = useAtomValue(accountsStatsAtom);

  if (isFrankendancer) return;
  if (!stats) return;

  return (
    <Flex gap="24px" direction="column" align="stretch" minWidth="0">
      <StatCards stats={stats} />
      <CacheTable stats={stats} />
      <TileTable stats={stats} />
      <PartitionTable stats={stats} />
    </Flex>
  );
}
