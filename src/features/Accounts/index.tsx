import { Flex, SegmentedControl } from "@radix-ui/themes";
import { useState } from "react";
import styles from "./accounts.module.css";
import DiskCard from "./DiskCard";
import IndexCard from "./IndexCard";
import CacheCard from "./CacheCard";
import CompactionCard from "./CompactionCard";
import IOCard from "./IOCard";
import CacheClasses from "./CacheClasses";
import PocCacheCard from "./CacheCard/PocCacheCard";
import PocIndexCard from "./IndexCard/PocIndexCard";
import PocCompactionCard from "./CompactionCard/PocCompactionCard";
import PocCacheClassesCard from "./CacheClasses/PocCacheClassesCard";
import Tiles from "./Tiles";
import Partitions from "./Partitions";
import PocDiskCard from "./DiskCard/PocDiskCard";

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
        {view === "poc" ? (
          <>
            <PocDiskCard />
            <PocCacheCard />
            <PocIndexCard />
            <PocCompactionCard />
          </>
        ) : (
          <>
            <DiskCard />
            <IndexCard />
            <CacheCard />
            <CompactionCard />
            <IOCard />
          </>
        )}
      </Flex>
      {view === "poc" ? (
        <>
          <PocCacheClassesCard />
          <Tiles />
          <Partitions />
        </>
      ) : (
        <>
          <CacheClasses />
          <Tiles />
          <Partitions />
        </>
      )}
    </Flex>
  );
}
