import { Box, Card, Flex, Text } from "@radix-ui/themes";
import { CatchingUpBars } from "./CatchingUpBars";
import { BarsFooter } from "./BarsFooter";
import BarsLabels from "./BarsLabels";
import { useAtomValue, useSetAtom } from "jotai";
import { catchingUpContainerElAtom, hasCatchingUpDataAtom } from "./atoms";
import ShredsChart from "../../../Overview/ShredsProgression/ShredsChart";
import styles from "./catchingUp.module.css";

export default function CatchingUp() {
  const setContainerEl = useSetAtom(catchingUpContainerElAtom);
  const hasCatchingUpData = useAtomValue(hasCatchingUpDataAtom);
  if (!hasCatchingUpData) return;

  return (
    <Flex direction="column" height="100%" gap="20px">
      <Flex ref={setContainerEl} direction="column" gap="5px">
        <BarsLabels />
        <CatchingUpBars />
        <BarsFooter />
      </Flex>

      <Card className={styles.card}>
        <Text className={styles.title}>Shreds</Text>
        <Box flexGrow="1" minHeight="280px">
          <ShredsChart chartId="catching-up-shreds" isOnStartupScreen />
        </Box>
      </Card>
    </Flex>
  );
}
