import { Flex } from "@radix-ui/themes";
import CardStat from "../../../components/CardStat";
import { useAtomValue } from "jotai";
import { estimatedTpsAtom } from "../../../api/atoms";
import {
  failureColor,
  headerColor,
  successColor,
  votesColor,
} from "../../../colors";

export default function TransactionStats() {
  const estimated = useAtomValue(estimatedTpsAtom);
  return (
    <Flex direction="column" gap="2" minWidth="100px">
      <CardStat
        label="Total TPS"
        value={
          estimated?.total.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }) ?? "-"
        }
        valueColor={headerColor}
        large
      />
      <Flex gap="4" wrap="wrap">
        <CardStat
          label="Non-vote TPS Success"
          value={
            estimated?.nonvote_success.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) ?? "-"
          }
          valueColor={successColor}
        />
        <CardStat
          label="Non-vote TPS Fail"
          value={
            estimated?.nonvote_failed.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) ?? "-"
          }
          valueColor={failureColor}
        />
        <CardStat
          label="Vote TPS"
          value={
            estimated?.vote.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) ?? "-"
          }
          valueColor={votesColor}
          style={{ minWidth: "90px" }}
        />
      </Flex>
    </Flex>
  );
}
