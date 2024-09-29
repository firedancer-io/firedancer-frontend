import { Flex, Link, Text } from "@radix-ui/themes";
import { identityKeyAtom } from "../../api/atoms";
import { useAtomValue } from "jotai";
import usePeer from "../../hooks/usePeer";
import { memo } from "react";
import PeerIcon from "../../components/PeerIcon";

// eslint-disable-next-line react-refresh/only-export-components
function ValidatorSummary() {
  const pubkey = useAtomValue(identityKeyAtom);
  const peer = usePeer(pubkey ?? "");

  if (!peer) return null;

  return (
    <>
      <PeerIcon url={peer?.info?.icon_url} size={70} />
      {/* <img src={fdLogo} alt="fd" style={{ height: "70px" }} /> */}
      <Flex direction="column" gap="1">
        <Text size="7" style={{ color: "#B2BCC9" }}>
          {peer.info?.name}
        </Text>
        <Text style={{ color: "#67696A" }}>{peer.identity_pubkey}</Text>
        {peer.info?.website && (
          <Link href={peer.info.website}>
            <Text>{peer.info.website}</Text>
          </Link>
        )}
      </Flex>
    </>
  );
}

const mValidatorCard = memo(ValidatorSummary);
export default mValidatorCard;
