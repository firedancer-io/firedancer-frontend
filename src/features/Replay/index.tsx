import { Card, Flex, Spinner } from "@radix-ui/themes";
import CardHeader from "../../components/CardHeader";
import Chart from "./Chart";
import { useAtomValue } from "jotai";
import { startupTimeAtom } from "../../api/atoms";
import { isWebgl2SupportedAtom } from "../WebGl/atoms";

export default function Replay() {
  const isWebGl2Supported = useAtomValue(isWebgl2SupportedAtom);
  const startupTimeNs = useAtomValue(startupTimeAtom)?.startupTimeNanos;
  return (
    <Flex direction="column" gap="4" height="100%">
      {isWebGl2Supported ? (
        startupTimeNs != null ? (
          <Card>
            <CardHeader text="Replay" />
            <Flex direction="column" gap="4" mt="2">
              <Chart
                key={String(startupTimeNs)}
                startupTimeNs={startupTimeNs}
              />
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
