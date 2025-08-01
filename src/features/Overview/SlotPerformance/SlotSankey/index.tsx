import { useMemo } from "react";
import { Sankey } from "../../../../sankey";
import AutoSizer from "react-virtualized-auto-sizer";
import { useAtomValue } from "jotai";
import {
  DisplayType,
  liveWaterfallAtom,
  sankeyDisplayTypeAtom,
  selectedSlotAtom,
} from "../atoms";
import { TxnWaterfall, TxnWaterfallOut } from "../../../../api/types";
import { Flex, Spinner, Text } from "@radix-ui/themes";
import { SlotNode, slotNodes } from "./consts";
import { sum } from "lodash";
import { useSlotQueryResponseDetailed } from "../../../../hooks/useSlotQuery";

function getGetValue({
  displayType,
  durationNanos,
  totalIncoming,
}: {
  displayType: DisplayType;
  durationNanos?: number | null;
  totalIncoming: number;
}) {
  return function getValue(value: number) {
    switch (displayType) {
      case DisplayType.Count:
        return value;
      case DisplayType.Pct: {
        let pct = Math.max(
          0,
          Math.round((value / totalIncoming) * 100_00) / 100,
        );
        if (!pct && value) {
          pct = 0.01;
        }
        return pct;
      }
      case DisplayType.Rate: {
        if (!durationNanos) return value;

        const durationSeconds = durationNanos / 1_000_000_000;
        return Math.trunc(value / durationSeconds);
      }
    }
  };
}

function getNetOut(out: TxnWaterfallOut) {
  return out.net_overrun;
}

function getQuicOut(out: TxnWaterfallOut) {
  return (
    out.quic_overrun +
    out.quic_frag_drop +
    out.quic_abandoned +
    out.tpu_quic_invalid +
    out.tpu_udp_invalid
  );
}

function getVerifyOut(out: TxnWaterfallOut) {
  return (
    out.verify_overrun +
    out.verify_parse +
    out.verify_failed +
    out.verify_duplicate
  );
}

function getDedupOut(out: TxnWaterfallOut) {
  return out.dedup_duplicate;
}

function getResolvOut(out: TxnWaterfallOut, resolvRetainedOut: number) {
  return (
    out.resolv_expired +
    out.resolv_lut_failed +
    out.resolv_no_ledger +
    out.resolv_ancient +
    resolvRetainedOut
  );
}

function getPackOut(out: TxnWaterfallOut) {
  return (
    out.pack_invalid +
    out.pack_invalid_bundle +
    out.pack_expired +
    out.pack_leader_slow +
    out.pack_retained +
    out.pack_wait_full
  );
}

function getSharedLinks(
  waterfall: TxnWaterfall,
  getValue: (value: number) => number,
) {
  const resolvShared = Math.min(
    waterfall.in.resolv_retained,
    waterfall.out.resolv_retained,
  );
  const resolvRetainedIn = waterfall.in.resolv_retained - resolvShared;
  const resolvRetainedOut = waterfall.out.resolv_retained - resolvShared;

  const quicCount =
    waterfall.in.quic + waterfall.in.udp - getNetOut(waterfall.out);
  const verificationCount = quicCount - getQuicOut(waterfall.out);
  const dedupCount =
    waterfall.in.block_engine +
    waterfall.in.gossip +
    verificationCount -
    getVerifyOut(waterfall.out);
  const resolvCount = dedupCount - getDedupOut(waterfall.out);
  const packCount =
    resolvRetainedIn +
    resolvCount -
    getResolvOut(waterfall.out, resolvRetainedOut);

  const bankCount =
    waterfall.in.pack_retained +
    waterfall.in.pack_cranked +
    packCount -
    getPackOut(waterfall.out);
  const blockCount = bankCount - waterfall.out.bank_invalid;

  return [
    {
      source: SlotNode.IncQuic,
      target: SlotNode.SlotStart,
      value: getValue(waterfall.in.quic),
    },
    {
      source: SlotNode.IncUdp,
      target: SlotNode.SlotStart,
      value: getValue(waterfall.in.udp),
    },
    {
      source: SlotNode.SlotStart,
      target: SlotNode.NetOverrun,
      value: getValue(waterfall.out.net_overrun),
    },
    {
      source: SlotNode.SlotStart,
      target: SlotNode.QUIC,
      value: getValue(quicCount),
    },
    {
      source: SlotNode.QUIC,
      target: SlotNode.QUICOverrun,
      value: getValue(waterfall.out.quic_overrun),
    },
    {
      source: SlotNode.QUIC,
      target: SlotNode.QUICInvalid,
      value: getValue(
        waterfall.out.tpu_quic_invalid + waterfall.out.tpu_udp_invalid,
      ),
    },
    {
      source: SlotNode.QUIC,
      target: SlotNode.QUICTooManyFrags,
      value: getValue(waterfall.out.quic_frag_drop),
    },
    {
      source: SlotNode.QUIC,
      target: SlotNode.QUICAbandoned,
      value: getValue(waterfall.out.quic_abandoned),
    },
    {
      source: SlotNode.QUIC,
      target: SlotNode.Verification,
      value: getValue(verificationCount),
    },
    {
      source: SlotNode.IncGossip,
      target: SlotNode.Verification,
      value: getValue(waterfall.in.gossip),
    },
    {
      source: SlotNode.IncBlockEngine,
      target: SlotNode.Verification,
      value: getValue(waterfall.in.block_engine),
    },
    {
      source: SlotNode.Verification,
      target: SlotNode.VerifyOverrun,
      value: getValue(waterfall.out.verify_overrun),
    },
    {
      source: SlotNode.Verification,
      target: SlotNode.VerifyParse,
      value: getValue(waterfall.out.verify_parse),
    },
    {
      source: SlotNode.Verification,
      target: SlotNode.VerifyFailed,
      value: getValue(waterfall.out.verify_failed),
    },
    {
      source: SlotNode.Verification,
      target: SlotNode.VerifyDuplicate,
      value: getValue(waterfall.out.verify_duplicate),
    },
    {
      source: SlotNode.Verification,
      target: SlotNode.Dedup,
      value: getValue(dedupCount),
    },
    {
      source: SlotNode.Dedup,
      target: SlotNode.DedupDeuplicate,
      value: getValue(waterfall.out.dedup_duplicate),
    },
    {
      source: SlotNode.Dedup,
      target: SlotNode.Resolv,
      value: getValue(resolvCount),
    },
    {
      source: SlotNode.IncResolvRetained,
      target: SlotNode.Resolv,
      value: getValue(resolvRetainedIn),
    },
    {
      source: SlotNode.Resolv,
      target: SlotNode.ResolvRetained,
      value: getValue(resolvRetainedOut),
    },
    {
      source: SlotNode.Resolv,
      target: SlotNode.ResolvFailed,
      value: getValue(waterfall.out.resolv_lut_failed),
    },
    {
      source: SlotNode.Resolv,
      target: SlotNode.ResolvExpired,
      value: getValue(
        waterfall.out.resolv_expired + waterfall.out.resolv_ancient,
      ),
    },
    {
      source: SlotNode.Resolv,
      target: SlotNode.ResolvNoLedger,
      value: getValue(waterfall.out.resolv_no_ledger),
    },
    {
      source: SlotNode.Resolv,
      target: SlotNode.Pack,
      value: getValue(packCount),
    },
    {
      source: SlotNode.IncPackCranked,
      target: SlotNode.Pack,
      value: getValue(waterfall.in.pack_cranked),
    },
    {
      source: SlotNode.IncPackRetained,
      target: SlotNode.Pack,
      value: getValue(waterfall.in.pack_retained),
    },
    {
      source: SlotNode.Pack,
      target: SlotNode.PackRetained,
      value: getValue(waterfall.out.pack_retained),
    },
    {
      source: SlotNode.Pack,
      target: SlotNode.PackInvalid,
      value: getValue(waterfall.out.pack_invalid),
    },
    {
      source: SlotNode.Pack,
      target: SlotNode.PackInvalidBundle,
      value: getValue(waterfall.out.pack_invalid_bundle),
    },
    {
      source: SlotNode.Pack,
      target: SlotNode.PackExpired,
      value: getValue(waterfall.out.pack_expired),
    },
    {
      source: SlotNode.Pack,
      target: SlotNode.PackLeaderSlow,
      value: getValue(waterfall.out.pack_leader_slow),
    },
    {
      source: SlotNode.Pack,
      target: SlotNode.PackWaitFull,
      value: getValue(waterfall.out.pack_wait_full),
    },
    {
      source: SlotNode.Pack,
      target: SlotNode.Bank,
      value: getValue(bankCount),
    },
    {
      source: SlotNode.Bank,
      target: SlotNode.BankInvalid,
      value: getValue(waterfall.out.bank_invalid),
    },
    {
      source: SlotNode.Bank,
      target: SlotNode.End,
      value: getValue(blockCount),
    },
    {
      source: SlotNode.End,
      target: SlotNode.SlotEnd,
      value: getValue(blockCount),
    },
  ];
}

function getLiveLinks(waterfall: TxnWaterfall, displayType: DisplayType) {
  const totalIncoming = sum(Object.values(waterfall.in));
  const getValue = getGetValue({
    displayType,
    durationNanos: undefined,
    totalIncoming,
  });

  return [
    ...getSharedLinks(waterfall, getValue),
    {
      source: SlotNode.SlotEnd,
      target: SlotNode.BlockFailure,
      value: getValue(waterfall.out.block_fail),
    },
    {
      source: SlotNode.SlotEnd,
      target: SlotNode.BlockSuccess,
      value: getValue(waterfall.out.block_success),
    },
  ];
}

function getHistoricalLinks(
  waterfall: TxnWaterfall,
  displayType: DisplayType,
  durationNanos?: number | null,
  successfulVoteTransactions?: number | null,
  failedVoteTransactions?: number | null,
  successfulNonVoteTransactions?: number | null,
  failedNonVoteTransactions?: number | null,
) {
  const totalIncoming = sum(Object.values(waterfall.in));
  const getValue = getGetValue({ displayType, durationNanos, totalIncoming });

  const votes =
    (successfulVoteTransactions ?? 0) + (failedVoteTransactions ?? 0);

  return [
    ...getSharedLinks(waterfall, getValue),
    {
      source: SlotNode.SlotEnd,
      target: SlotNode.Votes,
      value: getValue(votes),
    },
    {
      source: SlotNode.SlotEnd,
      target: SlotNode.NonVoteFailure,
      value: getValue(failedNonVoteTransactions ?? 0),
    },
    {
      source: SlotNode.SlotEnd,
      target: SlotNode.NonVoteSuccess,
      value: getValue(successfulNonVoteTransactions ?? 0),
    },
  ];
}

export default function Container() {
  const slot = useAtomValue(selectedSlotAtom);

  return <SlotSankey slot={slot} key={slot} />;
}

function SlotSankey({ slot }: { slot?: number }) {
  const displayType = useAtomValue(sankeyDisplayTypeAtom);
  const liveWaterfall = useAtomValue(liveWaterfallAtom);

  const query = useSlotQueryResponseDetailed(slot);

  const data = useMemo(() => {
    const waterfall = liveWaterfall ?? query.response?.waterfall;
    if (!waterfall) return;

    const links = liveWaterfall
      ? getLiveLinks(waterfall, displayType)
      : getHistoricalLinks(
          waterfall,
          displayType,
          query.response?.publish.duration_nanos,
          query.response?.publish.success_vote_transaction_cnt,
          query.response?.publish.failed_vote_transaction_cnt,
          query.response?.publish.success_nonvote_transaction_cnt,
          query.response?.publish.failed_nonvote_transaction_cnt,
        );

    const linkNodes = links.flatMap((l) => [l.source, l.target]);

    return {
      nodes: slotNodes.filter((n) => linkNodes.includes(n.id)),
      links,
    };
  }, [
    displayType,
    liveWaterfall,
    query.response?.publish.duration_nanos,
    query.response?.publish.failed_nonvote_transaction_cnt,
    query.response?.publish.failed_vote_transaction_cnt,
    query.response?.publish.success_nonvote_transaction_cnt,
    query.response?.publish.success_vote_transaction_cnt,
    query.response?.waterfall,
  ]);

  if (!data || !data.links.length) {
    if (!query.hasWaitedForData) {
      return (
        <Flex justify="center" align="center" height="100%">
          <Spinner style={{ height: 50, width: 50 }} />
        </Flex>
      );
    }

    return (
      <Flex justify="center" align="center" height="100%">
        <Text>No waterfall avaliable for this slot</Text>
      </Flex>
    );
  }

  return (
    <AutoSizer>
      {({ height, width }) => {
        const isRotated = width < 600;
        if (isRotated) {
          const swap = height;
          height = width;
          width = swap;
        }
        return (
          <Sankey
            height={height}
            width={width}
            data={data}
            margin={{
              top: 10,
              right: liveWaterfall ? 100 : isRotated ? 145 : 130,
              bottom: 35,
              left: 85,
            }}
            align="center"
            isInteractive={false}
            nodeThickness={0}
            nodeSpacing={getNodeSpacing(height)}
            nodeBorderWidth={1}
            sort="input"
            nodeBorderRadius={3}
            linkOpacity={1}
            enableLinkGradient
            labelPosition="outside"
            labelPadding={16}
          />
        );
      }}
    </AutoSizer>
  );
}

function getNodeSpacing(height: number) {
  if (height < 275) {
    return 32;
  } else if (height < 300) {
    return 36;
  } else if (height < 325) {
    return 40;
  } else if (height < 350) {
    return 48;
  }
  return 52;
}
