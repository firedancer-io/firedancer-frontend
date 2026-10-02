import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import ValidatorsStatsContent from "./ValidatorsStatsContent";

export default function ValidatorsCard({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <Flex direction="column" height="100%" gap="2">
        <CardHeader text="Validators" />
        <ValidatorsStatsContent />
      </Flex>
    </Card>
  );
}
