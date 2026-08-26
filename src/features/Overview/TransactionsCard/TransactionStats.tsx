import { Flex } from "@radix-ui/themes";
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
    <Flex direction="column" gap="2" minWidth="100px">
      <CardStat
        label="Total TPS"
        value={formatTps(tps?.total)}
        valueColor={headerColor}
        valueSize="medium"
      />
      <Flex gap="4" wrap="wrap">
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
      </Flex>
    </Flex>
  );
}
