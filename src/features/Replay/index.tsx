import { Card, Flex, Spinner } from "@radix-ui/themes";
import CardHeader from "../../components/CardHeader";
import Chart from "./Chart";
import SelectedInfo from "./SelectedInfo";
import { useAtomValue } from "jotai";
import { startupTimeAtom } from "../../api/atoms";
import { isWebgl2SupportedAtom } from "../WebGl/atoms";
import { clusterIndicatorHeight, headerHeight } from "../../consts";

export default function Replay() {
  const isWebGl2Supported = useAtomValue(isWebgl2SupportedAtom);
  const startupTimeNs = useAtomValue(startupTimeAtom)?.startupTimeNanos;
  return (
    <Flex
      direction="column"
      gap="4"
      // Fit exactly in the viewport below the (sticky) header — which stacks the
      // cluster indicator above the header row — minus the outlet container's
      // bottom padding (--space-2), so the page itself never scrolls and only the
      // chart's track list scrolls internally.
      height={`calc(100dvh - ${clusterIndicatorHeight + headerHeight}px - var(--space-2))`}
      minHeight="0"
    >
      {isWebGl2Supported ? (
        startupTimeNs != null ? (
          <Card style={{ height: "100%", minHeight: 0 }}>
            <Flex direction="column" gap="4" mt="2" height="100%" minHeight="0">
              {/* Fixed height so selecting a txn (which renders the taller
                  two-line info strip) doesn't shift the layout. */}
              <Flex align="center" gap="4" minWidth="0" height="32px">
                <CardHeader text="Replay" />
                <SelectedInfo />
              </Flex>
              <Flex direction="column" flexGrow="1" minHeight="0">
                <Chart
                  key={String(startupTimeNs)}
                  startupTimeNs={startupTimeNs}
                />
              </Flex>
            </Flex>
          </Card>
        ) : (
          <Spinner />
        )
      ) : (
        <div>WebGL2 support required</div>
      )}
    </Flex>
  );
}
