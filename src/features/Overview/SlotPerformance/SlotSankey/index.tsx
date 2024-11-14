import { useMemo } from "react";
import { Sankey } from "../../../../sankey";
import AutoSizer from "react-virtualized-auto-sizer";
import { atom, useAtomValue } from "jotai";
import { DisplayType, sankeyDisplayTypeAtom, selectedSlotAtom } from "../atoms";
import { liveTxnWaterfallAtom } from "../../../../api/atoms";
import { TxnWaterfall } from "../../../../api/types";
import useSlotQuery from "../../../../hooks/useSlotQuery";
import { Flex, Spinner, Text } from "@radix-ui/themes";
import { SlotNode, slotNodes } from "./consts";

function getLinks(
  waterfall: TxnWaterfall,
  displayType: DisplayType,
  totalTransactions?: number | null,
  failedTransactions?: number | null
) {
  const totalIncoming =
    waterfall.in.quic +
    waterfall.in.udp +
    waterfall.in.retained +
    waterfall.in.gossip;

  const quicCount =
    waterfall.in.quic + waterfall.in.udp - waterfall.out.net_overrun;

  const verificationCount =
    quicCount -
    waterfall.out.quic_overrun -
    waterfall.out.quic_frag_drop -
    waterfall.out.quic_frag_drop_g -
    waterfall.out.quic_aborted -
    waterfall.out.tpu_quic_invalid -
    waterfall.out.tpu_udp_invalid;

  const dedupCount =
    waterfall.in.gossip +
    verificationCount -
    waterfall.out.verify_overrun -
    waterfall.out.verify_parse -
    waterfall.out.verify_failed -
    waterfall.out.verify_duplicate;

  const resolvCount = dedupCount - waterfall.out.dedup_duplicate;

  const packCount = resolvCount - waterfall.out.resolv_failed;

  const bankCount =
    waterfall.in.retained +
    packCount -
    waterfall.out.pack_invalid -
    waterfall.out.pack_expired -
    waterfall.out.pack_leader_slow -
    waterfall.out.pack_retained -
    waterfall.out.pack_wait_full;

  const blockCount = bankCount - waterfall.out.bank_invalid;

  const blockFailure = failedTransactions ?? waterfall.out.block_fail;

  const blockSuccess =
    totalTransactions != null
      ? totalTransactions - blockFailure
      : waterfall.out.block_success;

  const getValue = (value: number) => {
    if (displayType === DisplayType.Count) {
      return value;
    }

    let pct = Math.max(0, Math.round((value / totalIncoming) * 100_00) / 100);
    if (!pct && value) {
      pct = 0.01;
    }
    return pct;
  };

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
        waterfall.out.tpu_quic_invalid + waterfall.out.tpu_udp_invalid
      ),
    },
    {
      source: SlotNode.QUIC,
      target: SlotNode.QUICTooManyStreams,
      value: getValue(waterfall.out.quic_frag_drop),
    },
    {
      source: SlotNode.QUIC,
      target: SlotNode.QUICTooManyFrags,
      value: getValue(waterfall.out.quic_frag_drop_g),
    },
    {
      source: SlotNode.QUIC,
      target: SlotNode.QUICAborted,
      value: getValue(waterfall.out.quic_aborted),
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
      source: SlotNode.Resolv,
      target: SlotNode.ResolvFailed,
      value: getValue(waterfall.out.resolv_failed),
    },
    {
      source: SlotNode.Resolv,
      target: SlotNode.Pack,
      value: getValue(packCount),
    },
    {
      source: SlotNode.IncRetained,
      target: SlotNode.Pack,
      value: getValue(waterfall.in.retained),
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
    {
      source: SlotNode.SlotEnd,
      target: SlotNode.BlockFailure,
      value: getValue(blockFailure),
    },
    {
      source: SlotNode.SlotEnd,
      target: SlotNode.BlockSuccess,
      value: getValue(blockSuccess),
    },
  ];
}

const liveWaterfallAtom = atom((get) => {
  const selectedSlot = get(selectedSlotAtom);
  if (!selectedSlot) return get(liveTxnWaterfallAtom)?.waterfall;
});

export default function Container() {
  const slot = useAtomValue(selectedSlotAtom);

  return <SlotSankey slot={slot} key={slot} />;
}

function SlotSankey({ slot }: { slot?: number }) {
  const displayType = useAtomValue(sankeyDisplayTypeAtom);
  const liveWaterfall = useAtomValue(liveWaterfallAtom);

  const query = useSlotQuery(slot);

  const data = useMemo(() => {
    const waterfall = liveWaterfall ?? query.slotResponse?.waterfall;

    if (!waterfall) return;

    const links = getLinks(
      waterfall,
      displayType,
      query.slotResponse?.publish.transactions,
      query.slotResponse?.publish.failed_transactions
    );

    const linkNodes = links.flatMap((l) => [l.source, l.target]);

    return {
      nodes: slotNodes.filter((n) => linkNodes.includes(n.id)),
      links: links,
    };
  }, [displayType, liveWaterfall, query.slotResponse]);

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
      {({ height, width }) => (
        <Sankey
          height={height}
          width={width}
          data={data}
          margin={{ top: 10, right: 80, bottom: 35, left: 85 }}
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
      )}
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
