import { Flex } from "@radix-ui/themes";
import CardStat from "../../../components/CardStat";
import { useAtomValue } from "jotai";
import { estimatedTpsAtom } from "../../../api/atoms";

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
        valueColor="#BDF3FF"
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
          valueColor="#67B873"
        />
        <CardStat
          label="Non-vote TPS Fail"
          value={
            estimated?.nonvote_failed.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) ?? "-"
          }
          valueColor="#E55171"
        />
        <CardStat
          label="Vote TPS"
          value={
            estimated?.vote.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) ?? "-"
          }
          valueColor="#557AE0"
          style={{ minWidth: "90px" }}
        />
      </Flex>
    </Flex>
  );
}
