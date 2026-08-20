import { Card, Flex } from "@radix-ui/themes";
import CardHeader from "../../components/CardHeader";
import Chart from "./Chart";
import { useAtomValue } from "jotai";
import { isWebgl2SupportedAtom } from "../WebGl/atoms";

export default function Replay() {
  const isWebGl2Supported = useAtomValue(isWebgl2SupportedAtom);
  return (
    <Flex direction="column" gap="4" height="100%">
      {isWebGl2Supported ? (
        <Card>
          <CardHeader text="Replay" />
          <Flex direction="column" gap="4" mt="2">
            <Chart />
          </Flex>
        </Card>
      ) : (
        <div>WebGL2 support required</div>
      )}
    </Flex>
  );
}
