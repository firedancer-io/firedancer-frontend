import { Flex, Grid } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { liveSystemResourcesAtom } from "../../../api/atoms";
import CpuSection from "./CpuSection";
import MemorySection from "./MemorySection";
import DiskSection from "./DiskSection";

const sectionGapY = "16px";

const hasResourcesAtom = selectAtom(
  liveSystemResourcesAtom,
  (resources) => resources != null,
);

export default function ResourcesCard() {
  const hasResources = useAtomValue(hasResourcesAtom);

  if (!hasResources) return null;

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
