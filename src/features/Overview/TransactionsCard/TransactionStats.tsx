import type { CSSProperties } from "react";
import CardStat from "../../../components/CardStat";
import { useAtomValue } from "jotai";
import { isAlpenglowAtom } from "../../../api/atoms";
import { estimatedTpsSeededAtom } from "./atoms";
import {
  failureColor,
  headerColor,
  nonVoteColor,
  votesColor,
} from "../../../colors";
import styles from "./transactionsStats.module.css";

const formatTps = (value?: number) =>
  value?.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) ?? "-";

export default function TransactionStats() {
  const isAlpenglow = useAtomValue(isAlpenglowAtom);
  const tps = useAtomValue(estimatedTpsSeededAtom);
  return (
    <div
      className="rt-Flex rt-r-fd-column rt-r-gap-2 rt-r-min-w"
      style={{ "--min-width": "100px" } as CSSProperties}
    >
      <CardStat
        label="Total TPS"
        value={formatTps(tps?.total)}
        valueColor={headerColor}
        valueSize="medium"
      />
      <div className="rt-Flex rt-r-fw-wrap rt-r-gap-4">
        <CardStat
          label={isAlpenglow ? "Success" : "Non-vote TPS Success"}
          value={formatTps(tps?.success)}
          valueColor={nonVoteColor}
          valueSize="small"
        />
        <CardStat
          label={isAlpenglow ? "Fail" : "Non-vote TPS Fail"}
          value={formatTps(tps?.failed)}
          valueColor={failureColor}
          valueSize="small"
        />
        {!isAlpenglow && (
          <CardStat
            label="Vote TPS"
            value={formatTps(tps?.vote)}
            valueColor={votesColor}
            valueSize="small"
            className={styles.voteTps}
          />
        )}
      </div>
    </div>
  );
}
