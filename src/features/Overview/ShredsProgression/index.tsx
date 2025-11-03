import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import ShredsTiles from "./ShredsTiles";

export default function ShredsProgression() {
  return (
    <Card>
      <Flex direction="column" height="100%" gap="2">
        <CardHeader text="Shreds" />
        <ShredsTiles />
      </Flex>
    </Card>
  );
}
