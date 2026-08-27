import type { CSSProperties } from "react";
import { useAtomValue } from "jotai";
import { peerStatsAtom } from "../../../atoms";
import {
  totalValidatorsColor,
  nonDelinquentColor,
  headerColor,
  failureColor,
} from "../../../colors";
import CardStat from "../../../components/CardStat";
import Chart from "../../Gossip/ValidatorStatsChart";
import { formatNumberLamports } from "./formatAmt";
import styles from "./validatorsCard.module.css";

export default function ValidatorsStatsContent() {
  const peerStats = useAtomValue(peerStatsAtom);
  if (!peerStats) return null;

  const activeLabel = formatNumberLamports(peerStats.activeStake);
  const delinquentLabel = formatNumberLamports(peerStats.delinquentStake);

  return (
    <div className="rt-Flex rt-r-gap-2 rt-r-fg-1">
      <div
        className="rt-Flex rt-r-fd-column rt-r-gap-2 rt-r-min-w"
        style={{ "--min-width": "0" } as CSSProperties}
      >
        <div className={styles.statRow}>
          <CardStat
            label="Total Validators"
            value={peerStats.validatorCount.toString()}
            valueColor={totalValidatorsColor}
            valueSize="medium"
          />
          <CardStat
            label="Non-delinquent Stake"
            value={activeLabel}
            valueColor={nonDelinquentColor}
            appendValue="SOL"
            valueSize="medium"
          />
        </div>
        <div className={styles.statRow}>
          <CardStat
            label="RPC Nodes"
            value={peerStats.rpcCount.toString()}
            valueColor={headerColor}
            valueSize="small"
          />
          <CardStat
            label="Delinquent Stake"
            value={delinquentLabel}
            valueColor={failureColor}
            appendValue="SOL"
            valueSize="small"
          />
        </div>
      </div>
      <div className="rt-Box" style={{ minWidth: "200px" }}>
        <Chart
          activeStake={peerStats.activeStake}
          delinquentStake={peerStats.delinquentStake}
        />
      </div>
    </div>
  );
}
