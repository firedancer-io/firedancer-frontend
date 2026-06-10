import { Flex } from "@radix-ui/themes";
import styles from "./accounts.module.css";
import DiskCard from "./DiskCard";
import IndexCard from "./IndexCard";
import CacheCard from "./CacheCard";
import CompactionCard from "./CompactionCard";
import IOCard from "./IOCard";
import CacheClasses from "./CacheClasses";
import Tiles from "./Tiles";
import Partitions from "./Partitions";

export default function Accounts() {
  return (
    <Flex direction="column" gap="5px">
      <Flex className={styles.cards} width="100%" wrap="wrap" gap="5px">
        <DiskCard />
        <IndexCard />
        <CacheCard />
        <CompactionCard />
        <IOCard />
      </Flex>
      <CacheClasses />
      <Tiles />
      <Partitions />
    </Flex>
  );
}
