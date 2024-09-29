import { Flex } from "@radix-ui/themes";
import CardStat from "../../../components/CardStat";
import { useAtomValue } from "jotai";
import { estimatedTpsAtom } from "../../../api/atoms";
import styles from "./transactionStats.module.css";

// const slotDurationBuffer = 100;

export default function TransactionStats() {
  // const slotDuration = useAtomValue(slotDurationAtom);
  const estimated = useAtomValue(estimatedTpsAtom);
  // const prevEstimated = usePreviousDistinct(estimated);
  // const [prevTime, setPrevTime] = useState(0);

  // useEffect(() => {
  // setPrevTime(performance.now());
  // }, [prevEstimated]);

  // const [values, setValues] = useState(prevEstimated);

  // useInterval(() => {
  //   if (!estimated) return;
  //   if (!prevEstimated) return estimated;

  //   const timeElapsed = performance.now() - prevTime;
  //   // TODO: Log interpolation and use slot duration
  //   const pctElapsed = timeElapsed / 3_000;

  //   if (pctElapsed > 1) return estimated;

  //   const totalDiff = (estimated.total - prevEstimated.total) * pctElapsed;
  //   const nonvoteSuccessDiff =
  //     (estimated.nonvote_success - prevEstimated.nonvote_success) * pctElapsed;
  //   const nonvoteFailedDiff =
  //     (estimated.nonvote_failed - prevEstimated.nonvote_failed) * pctElapsed;
  //   const voteDiff = (estimated.vote - prevEstimated.vote) * pctElapsed;

  //   setValues({
  //     total: prevEstimated.total + totalDiff,
  //     nonvote_success: prevEstimated.nonvote_success + nonvoteSuccessDiff,
  //     nonvote_failed: prevEstimated.nonvote_failed + nonvoteFailedDiff,
  //     vote: prevEstimated.vote + voteDiff,
  //   });
  // }, 50);

  return (
    <Flex
      direction="column"
      gap="2"
      minWidth="100px"
      className={styles.container}
    >
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
