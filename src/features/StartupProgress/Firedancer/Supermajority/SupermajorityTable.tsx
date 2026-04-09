import { Box, Flex, type FlexProps, Text } from "@radix-ui/themes";
import { ChevronUpIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import FiberManualRecordIcon from "@material-design-icons/svg/filled/fiber_manual_record.svg?react";
import { lamportsPerSol } from "../../../../consts";
import baseStyles from "./supermajority.module.css";
import styles from "./supermajorityTable.module.css";
import clsx from "clsx";
import { forwardRef, useCallback, useMemo, useState } from "react";
import Card from "../../../../components/Card";
import { useAtomValue } from "jotai";
import {
  supermajorityEpochAtom,
  supermajorityOfflinePeersAtom,
  supermajorityOnlinePeersAtom,
} from "../../../../atoms";
import PeerIcon from "../../../../components/PeerIcon";
import { getPeerIconUrl } from "../../../../utils";
import CopyButton from "../../../../components/CopyButton";
import { bootProgressAtom } from "../../../../api/atoms";
import type { PeerUpdateInfo } from "../../../../api/types";
import { usePeer } from "../../../../hooks/usePeer";
import { usePeerInfo } from "../../../../hooks/usePeerInfo";
import ClientIcons from "../../../../components/ClientIcons";
import { useMeasure } from "react-use";

const iconSize = "16px";

type Size = "wide" | "narrow" | "xnarrow";

interface SupermajorityTableProps {
  isStacked: boolean;
}
export default function SupermajorityTable({
  isStacked,
}: SupermajorityTableProps) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();

  const isXNarrow = width < 496;
  const isNarrow = !isXNarrow && width < 642;
  const size: Size = isXNarrow ? "xnarrow" : isNarrow ? "narrow" : "wide";

  const [isOfflineExpanded, setIsOfflineExpanded] = useState(true);
  const [isOnlineExpanded, setIsOnlineExpanded] = useState(false);

  const supermajorityEpoch = useAtomValue(supermajorityEpochAtom);

  const onlinePeers = useAtomValue(supermajorityOnlinePeersAtom);
  const offlinePeers = useAtomValue(supermajorityOfflinePeersAtom);

  const sortDescStake = useCallback(
    (a: string, b: string) => {
      const stakeA = supermajorityEpoch?.get(a)?.[0];
      const stakeB = supermajorityEpoch?.get(b)?.[0];

      if (stakeA == null && stakeB == null) return 0;
      if (stakeA == null) return 1;
      if (stakeB == null) return -1;
      return Number(stakeB - stakeA);
    },
    [supermajorityEpoch],
  );

  const sortedOfflinePeers = useMemo(() => {
    return [...offlinePeers].sort(sortDescStake);
  }, [offlinePeers, sortDescStake]);

  const sortedOnlinePeers = useMemo(() => {
    return [...onlinePeers].sort(sortDescStake);
  }, [onlinePeers, sortDescStake]);

  const totalStake =
    useAtomValue(bootProgressAtom)?.wait_for_supermajority_total_stake;

  return (
    <Flex
      ref={ref}
      className={clsx(
        styles.container,
        isStacked ? styles.vertical : styles.horizontal,
      )}
    >
      <Card
        className={clsx(baseStyles.card, styles.tableCard, {
          [styles.narrow]: isNarrow,
          [styles.xnarrow]: isXNarrow,
        })}
      >
        <SizedRow size={size} flexShrink="0" className={styles.headerRow}>
          <HeaderCell size={size} className={styles.peer}>
            Peer
          </HeaderCell>
          <HeaderCell size={size} className={styles.status}>
            Status
          </HeaderCell>
          <HeaderCell size={size} className={styles.pubkey}>
            Pubkey
          </HeaderCell>
          <HeaderCell size={size} className={styles.version}>
            Version
          </HeaderCell>
          <HeaderCell size={size} className={styles.stake}>
            Stake (SOL)
          </HeaderCell>
          <HeaderCell size={size} className={styles.stakePct}>
            Stake %
          </HeaderCell>
        </SizedRow>

        <SizedRow
          size={size}
          flexShrink="0"
          gapX="8px"
          align="center"
          className={clsx(styles.toggleRow, styles.offline)}
          asChild
        >
          <button onClick={() => setIsOfflineExpanded((prev) => !prev)}>
            <ToggleIcon isExpanded={isOfflineExpanded} />
            <Text>{offlinePeers.size} Nodes Offline</Text>
          </button>
        </SizedRow>

        <Box
          display={isOfflineExpanded ? undefined : "none"}
          className={styles.rowsContainer}
        >
          {sortedOfflinePeers.map((pubkey) => {
            const [lamportsStake, info] = supermajorityEpoch?.get(pubkey) ?? [];
            return (
              <DataRow
                key={pubkey}
                pubkey={pubkey}
                lamportsStake={lamportsStake}
                info={info}
                totalStake={totalStake}
                isOffline
                size={size}
              />
            );
          })}
        </Box>

        <SizedRow
          size={size}
          flexShrink="0"
          gapX="8px"
          align="center"
          className={clsx(styles.toggleRow, styles.online)}
          asChild
        >
          <button onClick={() => setIsOnlineExpanded((prev) => !prev)}>
            <ToggleIcon isExpanded={isOnlineExpanded} />
            <Text>{onlinePeers.size} Nodes Online</Text>
          </button>
        </SizedRow>

        <Box
          display={isOnlineExpanded ? undefined : "none"}
          className={styles.rowsContainer}
        >
          {sortedOnlinePeers.map((pubkey) => {
            const [lamportsStake, info] = supermajorityEpoch?.get(pubkey) ?? [];
            return (
              <DataRow
                key={pubkey}
                pubkey={pubkey}
                lamportsStake={lamportsStake}
                info={info}
                totalStake={totalStake}
                size={size}
              />
            );
          })}
        </Box>
      </Card>
    </Flex>
  );
}

function ToggleIcon({ isExpanded }: { isExpanded: boolean }) {
  const Icon = isExpanded ? ChevronDownIcon : ChevronUpIcon;
  return <Icon height={iconSize} width={iconSize} color="white" />;
}

interface SizedRowProps {
  size: Size;
}
const SizedRow = forwardRef<HTMLDivElement, SizedRowProps & FlexProps>(
  function SizedRow({ size, className, ...props }, ref) {
    return (
      <Flex
        ref={ref}
        className={clsx(styles.row, styles[size], className)}
        {...props}
      />
    );
  },
);

interface DataRowProps {
  pubkey: string;
  lamportsStake: bigint | undefined;
  info: PeerUpdateInfo | null | undefined;
  totalStake: bigint | null | undefined;
  isOffline?: boolean;
  size: Size;
}
function DataRow({
  pubkey,
  lamportsStake,
  info,
  totalStake,
  isOffline = false,
  size,
}: DataRowProps) {
  return (
    <SizedRow size={size} className={clsx({ [styles.offline]: isOffline })}>
      <IconNameCell
        name={info?.name}
        iconUrl={getPeerIconUrl(info)}
        isOffline={isOffline}
        size={size}
      />
      <StatusCell isOffline={isOffline} size={size} />
      <PubkeyCell pubkey={pubkey} size={size} />
      <ClientVersionCell pubkey={pubkey} size={size} />
      <StakeCell lamportsStake={lamportsStake} size={size} />
      <StakePctCell
        lamportsStake={lamportsStake}
        totalStake={totalStake}
        size={size}
      />
    </SizedRow>
  );
}

interface CellProps {
  className?: string;
  size: Size;
}
function Cell({
  children,
  className,
  size,
}: React.PropsWithChildren<CellProps>) {
  return (
    <Flex align="center" className={clsx(styles.cell, styles[size], className)}>
      {children}
    </Flex>
  );
}

function HeaderCell({
  children,
  className,
  size,
}: React.PropsWithChildren<CellProps>) {
  return (
    <Flex
      align="center"
      className={clsx(styles.cell, styles.header, styles[size], className)}
    >
      <Text truncate>{children}</Text>
    </Flex>
  );
}

interface IconNameCellProps {
  name: string | null | undefined;
  iconUrl: string | undefined;
  isOffline?: boolean;
  size: Size;
}
function IconNameCell({
  name,
  iconUrl,
  isOffline = false,
  size,
}: IconNameCellProps) {
  return (
    <Cell
      size={size}
      className={clsx(styles.peer, { [styles.offline]: isOffline })}
    >
      <PeerIcon url={iconUrl} size={16} />
      <Text truncate>{name ?? "-"}</Text>
    </Cell>
  );
}

interface StatusCellProps {
  isOffline?: boolean;
  size: Size;
}
function StatusCell({ isOffline = false, size }: StatusCellProps) {
  return (
    <Cell
      size={size}
      className={clsx(styles.status, { [styles.offline]: isOffline })}
    >
      <FiberManualRecordIcon height={12} width={12} fill="currentColor" />
      {size === "wide" && (
        <Text truncate>{isOffline ? "Offline" : "Online"}</Text>
      )}
    </Cell>
  );
}

interface PubkeyCellProps {
  pubkey: string;
  size: Size;
}
function PubkeyCell({ pubkey, size }: PubkeyCellProps) {
  return (
    <Cell size={size} className={styles.pubkey}>
      <CopyButton value={pubkey} color="white" size="10px" hideIconUntilHover>
        <Text truncate className={styles.pubkeyText}>
          {pubkey}
        </Text>
      </CopyButton>
    </Cell>
  );
}

interface ClientVersionCellProps {
  pubkey: string;
  size: Size;
  isOffline?: boolean;
}
function ClientVersionCell({
  pubkey,
  size,
  isOffline,
}: ClientVersionCellProps) {
  const peer = usePeer(pubkey);
  const { version, client } = usePeerInfo(peer);

  return (
    <Cell
      size={size}
      className={clsx(styles.version, { [styles.offline]: isOffline })}
    >
      <Flex width="35px">
        <ClientIcons
          client={client}
          size="xlarge"
          showPlaceholder
          className={styles.clientIcon}
          placeholderClassName={styles.clientIconPlaceholder}
        />
      </Flex>
      {size !== "xnarrow" && (
        <Text truncate dir="rtl">
          {version ? `v${version}` : "-"}
        </Text>
      )}
    </Cell>
  );
}

interface StakeCellProps {
  lamportsStake: bigint | undefined;
  size: Size;
}
function StakeCell({ lamportsStake, size }: StakeCellProps) {
  const formatted = formatStake(lamportsStake);

  return (
    <Cell size={size} className={styles.stake}>
      <Text>
        <Text>{formatted?.formatted ?? "-"}</Text>
        {formatted?.suffix && (
          <Text className={styles.suffix}> {formatted.suffix}</Text>
        )}
      </Text>
    </Cell>
  );
}

const stakeFormatter = Intl.NumberFormat(undefined, {
  notation: "compact",
  compactDisplay: "short",
  minimumSignificantDigits: 3,
  maximumSignificantDigits: 3,
});

function formatStake(lamport: bigint | null | undefined) {
  if (lamport == null) return;

  const sol = Number(lamport) / lamportsPerSol;
  const parts = stakeFormatter.formatToParts(sol);
  let formatted = "";
  let suffix = undefined;
  for (const { value, type } of parts) {
    if (type === "compact") {
      suffix = value;
    } else {
      formatted += value;
    }
  }

  return {
    formatted,
    suffix,
  };
}

interface StakePctCellProps {
  lamportsStake: bigint | undefined;
  totalStake: bigint | null | undefined;
  size: Size;
}
function StakePctCell({ lamportsStake, totalStake, size }: StakePctCellProps) {
  const value =
    !totalStake || lamportsStake == null
      ? "-"
      : ((Number(lamportsStake) / Number(totalStake)) * 100).toFixed(2);

  return (
    <Cell size={size} className={styles.stakePct}>
      <Text>
        <Text>{value}</Text>
        <Text className={styles.suffix}> %</Text>
      </Text>
    </Cell>
  );
}
