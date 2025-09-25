import { Text } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { incomePerCuToggleControlColor } from "../../../../colors";
import { useSlotQueryResponseTransactions } from "../../../../hooks/useSlotQuery";
import { selectedSlotAtom } from "../../../Overview/SlotPerformance/atoms";
import { getTxnIncome, removePortFromIp } from "../../../../utils";
import { formatNumberLamports } from "../../../Overview/ValidatorsCard/formatAmt";
import { defaultMaxValue } from "./RewardStats";
import { peersListAtom } from "../../../../atoms";
import { solDecimals } from "../../../../consts";

export default function TopIps() {
  const selectedSlot = useAtomValue(selectedSlotAtom);
  const query = useSlotQueryResponseTransactions(selectedSlot);

  const stats = useMemo(() => {
    const transactions = query?.response?.transactions;
    if (!transactions) return;

    const ipToIncome = transactions.txn_source_ipv4.reduce<
      Record<string, number>
    >((acc, ip, i) => {
      acc[ip] ??= 0;
      acc[ip] += Number(getTxnIncome(transactions, i));
      return acc;
    }, {});

    return Object.entries(ipToIncome)
      .sort(([, incomeA], [, incomeB]) => incomeB - incomeA)
      .slice(0, 3);
  }, [query]);

  if (!stats) return;

  const total =
    Number(defaultMaxValue) > stats[0]?.[1]
      ? Number(defaultMaxValue)
      : stats[0]?.[1];

  return (
    <>
      <Text style={{ color: "var(--gray-12)", gridColumn: "span 3" }}>
        Most Lucrative IPs
      </Text>
      {stats.map(([ip, income]) => {
        return (
          <Row
            key={ip}
            label={ip}
            value={income}
            total={total}
            color={incomePerCuToggleControlColor}
          />
        );
      })}
    </>
  );
}

interface RowProps {
  label: string;
  value: number;
  total: number;
  color: string;
}

function Row({ label, value, total, color }: RowProps) {
  const valuePct = total > 0n ? (value / total) * 100 : 0;

  const peersList = useAtomValue(peersListAtom);
  const validatorDisplay = useMemo(() => {
    const peer = peersList.find((peer) => {
      if (!peer.gossip) return false;
      const ips = Object.values(peer.gossip.sockets);
      return ips.some((peerIp) => removePortFromIp(peerIp) === label);
    });

    if (!peer) return;

    if (peer.info?.name) {
      if (peer.info.name.length > 20) {
        return `${peer.info.name.substring(0, 20)}...`;
      } else {
        return peer.info.name;
      }
    }

    return `${peer.identity_pubkey.substring(0, 8)}...`;
  }, [label, peersList]);

  return (
    <>
      <Text wrap="nowrap" style={{ color: "var(--gray-11)" }}>
        {label} {validatorDisplay ? ` (${validatorDisplay})` : ""}
      </Text>
      <Text wrap="nowrap" style={{ color }} align="right">
        {`${formatNumberLamports(value, solDecimals, {
          decimals: solDecimals,
          trailingZeroes: true,
        })} SOL`}
      </Text>
      <svg
        height="8"
        width="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ alignSelf: "center" }}
      >
        <rect height="8" width={`${valuePct}%`} opacity={0.6} fill={color} />
      </svg>
    </>
  );
}
