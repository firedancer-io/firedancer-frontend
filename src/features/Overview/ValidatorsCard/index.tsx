import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import { useAtomValue } from "jotai";
import { peerStatsAtom } from "../../../atoms";
import ValidatorsStatsContent from "./ValidatorsStatsContent";

export default function ValidatorsCard({ className }: { className?: string }) {
  const peerStats = useAtomValue(peerStatsAtom);
  if (!peerStats) return null;

  return (
    <Card className={className}>
      <Flex direction="column" height="100%" gap="2">
        <CardHeader text="Validators" />
        <ValidatorsStatsContent />
      </Flex>
    </Card>
  );
}
