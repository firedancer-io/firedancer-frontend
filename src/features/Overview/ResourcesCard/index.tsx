import { Flex, Grid } from "@radix-ui/themes";
import { atom, useAtomValue } from "jotai";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { liveSystemResourcesAtom, tilesAtom } from "../../../api/atoms";
import CpuSection from "./CpuSection";
import MemorySection from "./MemorySection";
import DiskSection from "./DiskSection";

const sectionGapY = "16px";

const isResourcesReadyAtom = atom(
  (get) => get(liveSystemResourcesAtom) != null && get(tilesAtom) != null,
);

export default function ResourcesCard() {
  const isResourcesReady = useAtomValue(isResourcesReadyAtom);

  if (!isResourcesReady) return null;

  return (
    <Card>
      <Flex direction="column" gap="12px">
        <CardHeader text="Resources" />
        <Grid
          columns={{
            initial: "minmax(0, 1fr)",
            lg: "minmax(0, 2fr) minmax(0, 1fr)",
          }}
          gapX="24px"
          gapY={sectionGapY}
          align="start"
        >
          <CpuSection />
          <Flex direction="column" minWidth="0" gap={sectionGapY}>
            <MemorySection />
            <DiskSection />
          </Flex>
        </Grid>
      </Flex>
    </Card>
  );
}
