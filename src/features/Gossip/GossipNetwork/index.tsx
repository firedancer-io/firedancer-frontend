import TrafficNetworkChart from "./TrafficNetworkChart";
import TrafficTreeMap from "./TrafficTreeMap";
import { Flex } from "@radix-ui/themes";
import MessagesTable from "./MessagesTable";
import StorageTable from "./StorageTable";
import Health from "./Health";

export default function Network() {
  return (
    <>
      <Flex align="center" justify="center">
        <TrafficNetworkChart />
        <TrafficTreeMap />
      </Flex>
      <Health />
      <Flex gap="9">
        <MessagesTable />
        <StorageTable />
      </Flex>
    </>
  );
}
