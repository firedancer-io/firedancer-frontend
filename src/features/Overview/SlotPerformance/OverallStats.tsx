import CardHeader from "../../../components/CardHeader";
import { Flex, Text } from "@radix-ui/themes";

export default function OverallStats() {
  return (
    <Flex direction="column" gap="4">
      <StatLabel
        title="Txns Ready at Slot Start"
        value={`${(9_081).toLocaleString()}`}
      />
      <StatLabel
        title="Txns Processed / Dropped"
        value={`${(124_082).toLocaleString()} / ${(5_235).toLocaleString()}`}
      />
      <StatLabel title="Success Rate" value="88.24%" />
      <StatLabel
        title="Compute Units Used"
        value={`${(249_572).toLocaleString()}`}
      />
    </Flex>
  );
}

interface StatLabelProps {
  title: string;
  value: string;
}
function StatLabel({ title, value }: StatLabelProps) {
  return (
    <Flex direction="column">
      <CardHeader text={title} />
      <Text size="7" weight="medium">
        {value}
      </Text>
    </Flex>
  );
}
