import { useMemo } from "react";
import type { Peer } from "../api/types";
import { ClientName, clientIdToClientName, resolveClientId } from "../consts";
import { getCountryFlagEmoji } from "../utils";

export function usePeerInfo(peer?: Peer) {
  const version = peer?.gossip?.version;
  const client_id = resolveClientId(peer?.gossip?.client_id, version);
  const client_name =
    client_id != null ? clientIdToClientName[client_id] : undefined;
  const client =
    client_name ??
    (version
      ? version[0] === "0"
        ? ClientName.Frankendancer
        : ClientName.Agave
      : undefined);
  const countryCode = peer?.gossip?.country_code;
  const countryFlag = getCountryFlagEmoji(countryCode);
  const cityName = peer?.gossip?.city_name;

  const info = useMemo(
    () => ({
      client,
      version,
      countryCode,
      countryFlag,
      cityName,
    }),
    [cityName, client, countryCode, countryFlag, version],
  );

  return info;
}
