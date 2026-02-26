import styles from "./tilesPerformance.module.css";
import TileCard from "./TileCard";
import { useTilesPerformance } from "./useTilesPerformance";
import { useState } from "react";
import { useAtomValue } from "jotai";
import { isStartupProgressVisibleAtom } from "../../StartupProgress/atoms";
import { getClientSpecificTileNames } from "../../../utils";
import { clientAtom } from "../../../atoms";

export default function TilesPerformance() {
  const [_isExpanded, setIsExpanded] = useState(false);
  const isStartupVisible = useAtomValue(isStartupProgressVisibleAtom);
  const isExpanded = _isExpanded && !isStartupVisible;

  const client = useAtomValue(clientAtom);
  const tileNames = getClientSpecificTileNames(client);

  const { tileCounts, groupedLiveIdlePerTile, showLive, queryIdleData } =
    useTilesPerformance();

  const netType = tileCounts["net"] ? "net" : "sock";

  return (
    <div className={styles.container}>
      <TileCard
        header={netType}
        subHeader="(in)"
        tileCount={tileCounts[netType]}
        liveIdlePerTile={groupedLiveIdlePerTile?.[netType]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.[netType]}
        statLabel="Ingress"
        metricType="net_in"
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
      <TileCard
        header="QUIC"
        tileCount={tileCounts["quic"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["quic"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["quic"]}
        statLabel="Conns"
        metricType="quic"
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
      {"bundle" in tileCounts && (
        <TileCard
          header="bundle"
          tileCount={tileCounts["bundle"]}
          liveIdlePerTile={groupedLiveIdlePerTile?.["bundle"]}
          queryIdlePerTile={showLive ? undefined : queryIdleData?.["bundle"]}
          {...(showLive
            ? {
                statLabel: "RTT",
                metricType: "bundle_rtt_smoothed_millis",
              }
            : {
                statLabel: "Lat p90",
                metricType: "bundle_rx_delay_millis_p90",
              })}
          isExpanded={isExpanded}
          setIsExpanded={setIsExpanded}
        />
      )}
      <TileCard
        header="verify"
        tileCount={tileCounts["verify"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["verify"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["verify"]}
        statLabel="Failed"
        metricType="verify"
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
      <TileCard
        header="dedup"
        tileCount={tileCounts["dedup"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["dedup"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["dedup"]}
        statLabel="Dupes"
        metricType="dedup"
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
      <TileCard
        header={tileNames.resolv}
        tileCount={tileCounts[tileNames.resolv]}
        liveIdlePerTile={groupedLiveIdlePerTile?.[tileNames.resolv]}
        queryIdlePerTile={
          showLive ? undefined : queryIdleData?.[tileNames.resolv]
        }
        statLabel="Resolv"
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
      <TileCard
        header="pack"
        tileCount={tileCounts["pack"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["pack"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["pack"]}
        statLabel="Full"
        metricType="pack"
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
      <TileCard
        header={tileNames.bank}
        tileCount={tileCounts[tileNames.bank]}
        liveIdlePerTile={groupedLiveIdlePerTile?.[tileNames.bank]}
        queryIdlePerTile={
          showLive ? undefined : queryIdleData?.[tileNames.bank]
        }
        statLabel="TPS"
        metricType="bank"
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
      <TileCard
        header={tileNames.poh}
        tileCount={tileCounts[tileNames.poh]}
        liveIdlePerTile={groupedLiveIdlePerTile?.[tileNames.poh]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.[tileNames.poh]}
        statLabel="Hash"
        // metricType="poh"
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
      <TileCard
        header="shred"
        tileCount={tileCounts["shred"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["shred"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["shred"]}
        statLabel="Shreds"
        // metricType="shred"
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
      <TileCard
        header={netType}
        subHeader="(out)"
        tileCount={tileCounts[netType]}
        liveIdlePerTile={groupedLiveIdlePerTile?.[netType]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.[netType]}
        statLabel="Egress" // mbs
        metricType="net_out"
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
    </div>
  );
}
