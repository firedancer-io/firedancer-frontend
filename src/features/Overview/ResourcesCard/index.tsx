import { Flex } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { liveSystemResourcesAtom, tilesAtom } from "../../../api/atoms";
import MemorySection from "./MemorySection";
import CpuSection from "./CpuSection";
import DiskSection from "./DiskSection";
import styles from "./resourcesCard.module.css";

export default function ResourcesCard() {
  const resources = useAtomValue(liveSystemResourcesAtom);
  const tiles = useAtomValue(tilesAtom);

  return (
    <Card>
      <Flex direction="column" gap="3">
        <CardHeader text="Resources" />
        <div className={styles.topSections}>
          <CpuSection cpus={resources?.cpus} tiles={tiles} />
          <MemorySection memory={resources?.memory} tiles={tiles} />
        </div>
        <DiskSection mounts={resources?.disk} />
      </Flex>
    </Card>
  );
}
