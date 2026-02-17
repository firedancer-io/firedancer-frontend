import { Flex, Grid, Text, Tooltip } from "@radix-ui/themes";
import styles from "./slotCardGrid.module.css";
import { useAtomValue, useSetAtom } from "jotai";
import {
  clientAtom,
  currentSlotAtom,
  firstProcessedSlotAtom,
  skippedClusterSlotsAtom,
} from "../../../atoms";
import { useEffect, useRef, useState } from "react";
import "react-circular-progressbar/dist/styles.css";
import { useSlotQueryPublish } from "../../../hooks/useSlotQuery";
import type { SlotPublish } from "../../../api/types";
import { fixValue, getDiscountedVoteLatency } from "../../../utils";
import { useMedia, usePrevious, useUnmount } from "react-use";
import {
  defaultMaxComputeUnits,
  lamportsPerSol,
  nonBreakingSpace,
  solDecimals,
} from "../../../consts";
import { formatNumberLamports } from "../../Overview/ValidatorsCard/formatAmt";
import {
  setScrollFuncsAtom,
  deleteScrollFuncsAtom,
  scrollAllFuncsAtom,
} from "./atoms";
import clsx from "clsx";
import { identityKeyAtom } from "../../../api/atoms";
import { usePubKey } from "../../../hooks/usePubKey";
import {
  PlaceholderIcon,
  SkippedIcon,
  StatusIcon,
} from "../../../components/StatusIcon";
import { ClientEnum } from "../../../api/entities";
import LinkedSlotText from "./SlotText";

interface SlotCardGridProps {
  slot: number;
  currentSlot?: number;
}

export default function SlotCardGrid({ slot, currentSlot }: SlotCardGridProps) {
  const client = useAtomValue(clientAtom);

  const ref = useRef<HTMLDivElement | null>(null);
  const setScroll = useSetAtom(setScrollFuncsAtom);
  const deleteScroll = useSetAtom(deleteScrollFuncsAtom);
  const scrollAll = useSetAtom(scrollAllFuncsAtom);

  useEffect(() => {
    setScroll(slot, (scrollLeft: number) => {
      ref.current?.scrollTo(scrollLeft, 0);
    });
    return () => deleteScroll(slot);
  }, [deleteScroll, setScroll, slot]);

  return (
    <Flex minWidth="0" flexGrow="1">
      <SlotColumn slot={slot} currentSlot={currentSlot} />
      <div
        className={clsx(
          styles.grid,
          client === ClientEnum.Firedancer && styles.firedancerGrid,
        )}
        ref={ref}
        onScroll={(e) => {
          scrollAll(slot, e.currentTarget.scrollLeft);
        }}
      >
        {client === ClientEnum.Firedancer && (
          <Text
            className={clsx(styles.headerText, styles.voteLatencyHeader)}
            align="right"
          >
            Vote&nbsp;Latency
          </Text>
        )}
        <Text
          className={clsx(styles.headerText, styles.votesHeader)}
          align="right"
        >
          Votes
        </Text>
        <Text
          className={clsx(styles.headerText, styles.nonVotesHeader)}
          align="right"
        >
          Non-votes
        </Text>
        <Text
          className={clsx(styles.headerText, styles.feesHeader)}
          align="right"
        >
          Fees
        </Text>
        <Text
          className={clsx(styles.headerText, styles.tipsHeader)}
          align="right"
        >
          Tips
        </Text>
        <Text
          className={clsx(styles.headerText, styles.durationHeader)}
          align="right"
        >
          Duration
        </Text>
        <Text
          className={clsx(styles.headerText, styles.computeUnitsHeader)}
          align="right"
        >
          Compute&nbsp;Units
        </Text>
        {new Array(4).fill(0).map((_, i) => {
          const cardSlot = slot + 3 - i;
          return (
            <SlotCardRow
              key={cardSlot}
              slot={cardSlot}
              active={cardSlot === currentSlot}
            />
          );
        })}
      </div>
    </Flex>
  );
}

interface SlotCardGridProps {
  slot: number;
  currentSlot?: number;
}

function SlotColumn({ slot, currentSlot }: SlotCardGridProps) {
  const isWideScreen = useMedia("(min-width: 700px)");

  return (
    <Flex direction="column" gap="1px">
      <Text className={clsx(styles.headerText, styles.slotHeaderText)}>
        {isWideScreen ? "Slot" : "\u00A0"}
      </Text>
      {new Array(4).fill(0).map((_, i) => {
        const cardSlot = slot + 3 - i;
        const isCurrent = cardSlot === currentSlot;

        return (
          <SlotText
            key={cardSlot}
            slot={cardSlot}
            isCurrent={isCurrent}
            isWideScreen={isWideScreen}
          />
        );
      })}
    </Flex>
  );
}

interface SlotTextProps {
  slot: number;
  isCurrent: boolean;
}

function SlotText({
  slot,
  isCurrent,
  isWideScreen,
}: SlotTextProps & { isWideScreen: boolean }) {
  const queryPublish = useSlotQueryPublish(slot);
  const pubkey = usePubKey(slot);
  const myPubkey = useAtomValue(identityKeyAtom);
  const isLeader = myPubkey === pubkey;

  return (
    <Flex
      className={clsx(styles.rowText, isCurrent && styles.active)}
      align="center"
      gap={isWideScreen ? "2" : "0"}
    >
      {isWideScreen ? (
        <LinkedSlotText slot={slot} isLeader={isLeader} />
      ) : (
        <Text>&nbsp;</Text>
      )}
      <StatusIcon slot={slot} isCurrent={isCurrent} size="small" />
      {queryPublish.publish?.skipped ? (
        <SkippedIcon size="small" />
      ) : (
        <PlaceholderIcon size="small" />
      )}
    </Flex>
  );
}

interface RowValues {
  voteTxns: string;
  nonVoteTxns: string;
  totalFees: string;
  transactionFeeFull: string;
  priorityFeeFull: string;
  tips: string;
  tipsFull: string;
  durationText: string;
  computeUnits: number;
  computeUnitsPct: number;
  voteLatency: { text: string; color?: string };
}

interface SlotCardRowProps {
  slot: number;
  active?: boolean;
}

function getRowValues(
  publish: SlotPublish,
  skippedClusterSlots: Set<number>,
): RowValues {
  const voteTxnsSuccess = fixValue(publish.success_vote_transaction_cnt ?? 0);
  const nonVoteTxnsSuccess = fixValue(
    publish.success_nonvote_transaction_cnt ?? 0,
  );
  const voteTxnsFailure = fixValue(publish.failed_vote_transaction_cnt ?? 0);
  const nonVoteTxnsFailure = fixValue(
    publish.failed_nonvote_transaction_cnt ?? 0,
  );
  const totalFees = formatNumberLamports(
    (publish.transaction_fee ?? 0n) + (publish.priority_fee ?? 0n),
    solDecimals,
    {
      decimals: solDecimals,
      trailingZeroes: true,
    },
  );

  const transactionFeeFull =
    publish.transaction_fee != null
      ? (Number(publish.transaction_fee) / lamportsPerSol).toString()
      : "0";

  const priorityFeeFull =
    publish.priority_fee != null
      ? (Number(publish.priority_fee) / lamportsPerSol).toString()
      : "0";

  const tips = formatNumberLamports(publish.tips ?? 0n, solDecimals, {
    decimals: solDecimals,
    trailingZeroes: true,
  });
  const tipsFull =
    publish.tips != null
      ? (Number(publish.tips) / lamportsPerSol).toString()
      : "0";

  const durationText =
    publish.duration_nanos !== null
      ? `${Math.trunc(publish.duration_nanos / 1_000_000)} ms`
      : "-";

  const computeUnits = fixValue(publish?.compute_units ?? 0);
  const computeUnitsPct =
    publish.compute_units != null
      ? (publish.compute_units /
          (publish.max_compute_units ?? defaultMaxComputeUnits)) *
        100
      : 0;

  const voteLatency =
    publish.vote_latency != null
      ? {
          text: getDiscountedVoteLatency(
            publish.slot,
            publish.vote_latency,
            skippedClusterSlots,
          ).toLocaleString(),
        }
      : publish.skipped
        ? { text: "" }
        : publish.level === "rooted"
          ? { text: "✕", color: "#FF3C3C" }
          : { text: "-" };

  return {
    voteTxns: (voteTxnsSuccess + voteTxnsFailure).toLocaleString(),
    nonVoteTxns: (nonVoteTxnsSuccess + nonVoteTxnsFailure).toLocaleString(),
    totalFees,
    transactionFeeFull,
    priorityFeeFull,
    tips,
    tipsFull,
    durationText,
    computeUnits,
    computeUnitsPct,
    voteLatency,
  };
}

function SlotCardRow({ slot, active }: SlotCardRowProps) {
  const client = useAtomValue(clientAtom);
  const firstProcessedSlot = useAtomValue(firstProcessedSlotAtom);
  const currentSlot = useAtomValue(currentSlotAtom);
  const skippedClusterSlots = useAtomValue(skippedClusterSlotsAtom);

  const queryPublish = useSlotQueryPublish(slot);

  const [values, setValues] = useState<RowValues | undefined>(() => {
    if (!queryPublish.publish) return;
    return getRowValues(queryPublish.publish, skippedClusterSlots);
  });

  useEffect(() => {
    if (queryPublish.publish) {
      setValues(getRowValues(queryPublish.publish, skippedClusterSlots));
    }
  }, [queryPublish.publish, skippedClusterSlots, slot]);

  const isFuture = slot > (currentSlot ?? Infinity);
  const isCurrent = slot === currentSlot;

  const timeoutRef = useRef<NodeJS.Timeout>();
  const [isRecentlyCurrent, setIsRecentlyCurrent] = useState(false);
  const prevIsCurrent = usePrevious(isCurrent);

  if (prevIsCurrent && !isCurrent && !isRecentlyCurrent) {
    // If recently switched from current to not current,
    // delay loading text to prevent flickering transitions
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsRecentlyCurrent(false);
    }, 50);
    setIsRecentlyCurrent(true);
  }

  useUnmount(() => {
    clearTimeout(timeoutRef.current);
  });

  const isSnapshot = slot < (firstProcessedSlot ?? 0);

  const getText = (text?: string | number, suffix?: string) => {
    if (isFuture || isCurrent || isSnapshot) return "-";
    if (!values && !queryPublish.hasWaitedForData && !isRecentlyCurrent)
      return "Loading...";
    if (!values) return "-";

    if (typeof text === "number") text = Math.round(text);
    return `${text}${suffix ?? ""}`;
  };

  const valueClassName = clsx(styles.rowText, {
    [styles.active]: active,
  });

  return (
    <>
      {client === ClientEnum.Firedancer && (
        <Text
          className={valueClassName}
          align="right"
          style={{ color: values?.voteLatency?.color }}
        >
          {getText(values?.voteLatency.text)}
        </Text>
      )}
      <Text className={valueClassName} align="right">
        {getText(values?.voteTxns)}
      </Text>
      <Text className={valueClassName} align="right">
        {getText(values?.nonVoteTxns)}
      </Text>
      <Tooltip
        content={
          <Grid columns="auto auto" rows="2" gapX="3">
            <Text>Transaction</Text>
            <Text>Priority</Text>
            <Text>{values?.transactionFeeFull} SOL</Text>
            <Text>{values?.priorityFeeFull} SOL</Text>
          </Grid>
        }
      >
        <Text className={valueClassName} align="right">
          {getText(values?.totalFees)}
        </Text>
      </Tooltip>
      <Tooltip content={`${values?.tipsFull} SOL`}>
        <Text className={valueClassName} align="right">
          {getText(values?.tips)}
        </Text>
      </Tooltip>
      <Text className={valueClassName} align="right">
        {getText(values?.durationText)}
      </Text>
      {values?.computeUnits !== undefined ? (
        <Text className={valueClassName} align="right" style={{ padding: 0 }}>
          <>
            {getText(values?.computeUnits.toLocaleString())}
            <span className={styles.computeUnitsPct}>
              {values?.computeUnitsPct !== undefined
                ? `${nonBreakingSpace}(${getText(values?.computeUnitsPct)}%)`
                : null}
            </span>
          </>
        </Text>
      ) : (
        <Text className={valueClassName} align="right">
          {getText()}
        </Text>
      )}
    </>
  );
}
