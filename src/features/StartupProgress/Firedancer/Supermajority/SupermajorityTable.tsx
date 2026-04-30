import { Box, Flex, type FlexProps, Text } from "@radix-ui/themes";
import { ChevronRightIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import FiberManualRecordIcon from "@material-design-icons/svg/filled/fiber_manual_record.svg?react";
import FiberManualRecordIconOutlined from "@material-design-icons/svg/outlined/fiber_manual_record.svg?react";
import baseStyles from "./supermajority.module.css";
import styles from "./supermajorityTable.module.css";
import clsx from "clsx";
import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
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
import { formatStake, getStakePct } from "./utils";
import { Virtuoso } from "react-virtuoso";

const iconSize = "16px";
const rowHeight = 33;

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
      return stakeA === stakeB ? 0 : stakeA < stakeB ? 1 : -1;
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

  const getOfflinePubkey = useCallback(
    (index: number) => sortedOfflinePeers[index],
    [sortedOfflinePeers],
  );

  const getOfflineItemContent = useCallback(
    (index: number) => {
      const pubkey = getOfflinePubkey(index);
      const [lamportsStake, info] = supermajorityEpoch?.get(pubkey) ?? [];
      return (
        <DataRow
          pubkey={pubkey}
          lamportsStake={lamportsStake}
          info={info}
          totalStake={totalStake}
          isOffline
          size={size}
        />
      );
    },
    [getOfflinePubkey, size, supermajorityEpoch, totalStake],
  );

  const getOnlinePubkey = useCallback(
    (index: number) => sortedOnlinePeers[index],
    [sortedOnlinePeers],
  );

  const getOnlineItemContent = useCallback(
    (index: number) => {
      const pubkey = getOnlinePubkey(index);
      const [lamportsStake, info] = supermajorityEpoch?.get(pubkey) ?? [];
      return (
        <DataRow
          pubkey={pubkey}
          lamportsStake={lamportsStake}
          info={info}
          totalStake={totalStake}
          size={size}
        />
      );
    },
    [getOnlinePubkey, size, supermajorityEpoch, totalStake],
  );

  return (
    <Flex
      ref={ref}
      className={clsx(
        styles.container,
        isStacked ? styles.vertical : styles.horizontal,
      )}
      style={{ "--row-height": `${rowHeight}px` } as CSSProperties}
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
          <button
            type="button"
            aria-expanded={isOfflineExpanded}
            aria-controls="supermajority-offline-rows"
            onClick={() => setIsOfflineExpanded((prev) => !prev)}
          >
            <ToggleIcon isExpanded={isOfflineExpanded} />
            <Text>{offlinePeers.size} Nodes Offline</Text>
          </button>
        </SizedRow>

        <Box
          display={isOfflineExpanded ? undefined : "none"}
          className={styles.rowsContainer}
          id="supermajority-offline-rows"
        >
          <Virtuoso
            totalCount={sortedOfflinePeers.length}
            fixedItemHeight={rowHeight}
            computeItemKey={getOfflinePubkey}
            itemContent={getOfflineItemContent}
          />
        </Box>

        <SizedRow
          size={size}
          flexShrink="0"
          gapX="8px"
          align="center"
          className={clsx(styles.toggleRow, styles.online)}
          asChild
        >
          <button
            type="button"
            aria-expanded={isOnlineExpanded}
            aria-controls="supermajority-online-rows"
            onClick={() => setIsOnlineExpanded((prev) => !prev)}
          >
            <ToggleIcon isExpanded={isOnlineExpanded} />
            <Text>{onlinePeers.size} Nodes Online</Text>
          </button>
        </SizedRow>

        <Box
          id="supermajority-online-rows"
          display={isOnlineExpanded ? undefined : "none"}
          className={styles.rowsContainer}
        >
          <Virtuoso
            totalCount={sortedOnlinePeers.length}
            fixedItemHeight={rowHeight}
            computeItemKey={getOnlinePubkey}
            itemContent={getOnlineItemContent}
          />
        </Box>
      </Card>
    </Flex>
  );
}

function ToggleIcon({ isExpanded }: { isExpanded: boolean }) {
  const Icon = isExpanded ? ChevronDownIcon : ChevronRightIcon;
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
      <ClientVersionCell pubkey={pubkey} size={size} isOffline={isOffline} />
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
  const Icon = isOffline
    ? FiberManualRecordIconOutlined
    : FiberManualRecordIcon;
  return (
    <Cell
      size={size}
      className={clsx(styles.status, { [styles.offline]: isOffline })}
    >
      <Icon height={12} width={12} fill="currentColor" />
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
  isOffline: boolean;
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

interface StakePctCellProps {
  lamportsStake: bigint | undefined;
  totalStake: bigint | null | undefined;
  size: Size;
}

const pctDecimals = 2;
function StakePctCell({ lamportsStake, totalStake, size }: StakePctCellProps) {
  const pct = getStakePct(lamportsStake, totalStake, pctDecimals);

  return (
    <Cell size={size} className={styles.stakePct}>
      <Text>
        <Text>{pct === undefined ? "-" : pct.toFixed(pctDecimals)}</Text>
        {pct !== undefined && <Text className={styles.suffix}> %</Text>}
      </Text>
    </Cell>
  );
}
