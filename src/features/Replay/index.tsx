import { Card, Flex } from "@radix-ui/themes";
import CardHeader from "../../components/CardHeader";
import Chart from "./Chart";
import { useAtomValue } from "jotai";
import { startupTimeAtom } from "../../api/atoms";

export default function Replay() {
  const startupTimeNs = useAtomValue(startupTimeAtom)?.startupTimeNanos;
  return (
    <Flex direction="column" gap="4" height="100%">
      <Card>
        <Flex direction="column" gap="4">
          <CardHeader text="Replay" />
          {startupTimeNs != null && (
            <Chart key={String(startupTimeNs)} startupTimeNs={startupTimeNs} />
          )}
        </Flex>
      </Card>
    </Flex>
  );
}
