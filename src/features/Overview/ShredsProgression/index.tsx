import { Flex } from "@radix-ui/themes";
import Card from "../../../components/Card";
import CardHeader from "../../../components/CardHeader";
import ShredsTiles from "./ShredsTiles";
import { useAtomValue } from "jotai";
import { ClientEnum } from "../../../api/entities";
import { clientAtom } from "../../../atoms";

export default function ShredsProgression() {
  const client = useAtomValue(clientAtom);

  if (client !== ClientEnum.Firedancer) return;

  return (
    <Card>
      <Flex direction="column" height="100%" gap="2">
        <CardHeader text="Shreds" />
        <ShredsTiles />
      </Flex>
    </Card>
  );
}
