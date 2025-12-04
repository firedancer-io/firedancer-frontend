import { useMemo } from "react";
import type { Peer } from "../api/types";
import { clientIdToClientName, ClientName } from "../consts";
import { getCountryFlagEmoji } from "../utils";

export function usePeerInfo(peer?: Peer) {
  const version = peer?.gossip?.version;
  const client_id = peer?.gossip?.client_id;
  const client_name = client_id ? clientIdToClientName[client_id] : undefined;
  const client =
    client_name ??
    (version
      ? version[0] === "0"
        ? ClientName.Frankendancer
        : ClientName.Agave
      : undefined);
  const countryCode = peer?.gossip?.country_code;
  const countryFlag = getCountryFlagEmoji(countryCode);

  const info = useMemo(
    () => ({
      client,
      version,
      countryCode,
      countryFlag,
    }),
    [client, countryCode, countryFlag, version],
  );

  return info;
}
