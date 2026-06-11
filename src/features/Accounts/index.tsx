import { Flex, SegmentedControl } from "@radix-ui/themes";
import { useState } from "react";
import styles from "./accounts.module.css";
import DiskCard from "./DiskCard";
import DiskPieChart from "./DiskCard/DiskPieChart";
import IndexCard from "./IndexCard";
import PocIndexCard from "./IndexCard/PocIndexCard";
import CacheCard from "./CacheCard";
import PocCacheCard from "./CacheCard/PocCacheCard";
import CompactionCard from "./CompactionCard";
import PocCompactionCard from "./CompactionCard/PocCompactionCard";
import IOCard from "./IOCard";
import CacheClasses from "./CacheClasses";
import Tiles from "./Tiles";
import Partitions from "./Partitions";

type ViewMode = "default" | "poc";

export default function Accounts() {
  const [view, setView] = useState<ViewMode>("default");

  return (
    <Flex direction="column" gap="5px">
      <Flex justify="start">
        <SegmentedControl.Root
          value={view}
          onValueChange={(v) => setView(v as ViewMode)}
          size="1"
        >
          <SegmentedControl.Item value="default">Current</SegmentedControl.Item>
          <SegmentedControl.Item value="poc">POC</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <Flex
        className={view === "poc" ? styles.pocCards : styles.cards}
        width="100%"
        wrap="wrap"
        gap="5px"
      >
        {view === "poc" ? <PocIndexCard /> : <DiskCard />}
        {view === "poc" ? <DiskPieChart /> : <IndexCard />}
        {view === "poc" ? <PocCacheCard /> : <CacheCard />}
        {view === "poc" ? <PocCompactionCard /> : <CompactionCard />}
        {view !== "poc" && <IOCard />}
      </Flex>
      <CacheClasses />
      <Tiles />
      <Partitions />
    </Flex>
  );
}
