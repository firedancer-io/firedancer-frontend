import styles from "./tilesPerformance.module.css";
import TileCard from "./TileCard";
import { useTilesPerformance } from "./useTilesPerformance";
import { useState } from "react";

export default function TilesPerformance() {
  const [isExpanded, setIsExpanded] = useState(false);
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
        header="resolv"
        tileCount={tileCounts["resolv"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["resolv"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["resolv"]}
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
        header="bank"
        tileCount={tileCounts["bank"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["bank"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["bank"]}
        statLabel="TPS"
        metricType="bank"
        isExpanded={isExpanded}
        setIsExpanded={setIsExpanded}
      />
      <TileCard
        header="poh"
        tileCount={tileCounts["poh"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["poh"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["poh"]}
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
        header="store"
        tileCount={tileCounts["store"]}
        liveIdlePerTile={groupedLiveIdlePerTile?.["store"]}
        queryIdlePerTile={showLive ? undefined : queryIdleData?.["store"]}
        statLabel="Latency"
        // metricType="store"
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
