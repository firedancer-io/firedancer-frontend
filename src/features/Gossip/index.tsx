import { Flex } from "@radix-ui/themes";
import GossipNetwork from "./GossipNetwork";
import PeerTable from "./PeerTable.tsx";

export default function Gossip() {
  return (
    <Flex direction="column" gap="4" flexGrow="1" flexShrink="1" height="100%">
      <PeerTable />
      <GossipNetwork />
    </Flex>
  );
}
