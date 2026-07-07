import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { hasAccountStatsAtom } from "../../api/atoms";
import styles from "./accounts.module.css";
import DiskCard from "./DiskCard";
import IndexCard from "./IndexCard";
import CacheCard from "./CacheCard";
import CompactionCard from "./CompactionCard";
import CacheClasses from "./CacheClasses";
import Tiles from "./Tiles";
import Partitions from "./Partitions";

export default function Accounts() {
  const hasAccountStats = useAtomValue(hasAccountStatsAtom);
  if (!hasAccountStats) return;

  return (
    <Flex direction="column" gap="5px">
      <Flex className={styles.cards} wrap="wrap" gap="5px">
        <CacheCard className={styles.cacheCard} />
        <DiskCard />
        <CompactionCard className={styles.compactionCard} />
        <IndexCard />
      </Flex>
      <CacheClasses />
      <Tiles />
      <Partitions />
    </Flex>
  );
}
