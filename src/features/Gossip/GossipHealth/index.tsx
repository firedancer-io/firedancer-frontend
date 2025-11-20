import { Card, Flex, Grid, Text } from "@radix-ui/themes";
import type { GossipNetworkHealth } from "../../../api/types";
import { useEmaValue } from "../../../hooks/useEma";
import { type PropsWithChildren } from "react";
import { compactSingleDecimalFormatter } from "../../../numUtils";
import GossipHealthSparklines from "./GossipHealthSparklines";
import { clamp } from "lodash";
import { headerGap } from "../consts";

const pushColor = "#197CAE";
const pullColor = "var(--amber-8)";
const totalColor = "#CBD4D6";
const sparklineColors = [pushColor, pullColor];

interface GossipHealthProps {
  health: GossipNetworkHealth;
}

export default function GossipHealth({ health }: GossipHealthProps) {
  return (
    <Grid
      columns={{
        initial: "1",
        sm: "2",
        lg: "4",
      }}
      gapY="3"
      gapX="7"
    >
      <MessageFailureCard health={health} />
      <EntryTotalCard health={health} />
      <EntryDuplicateCard health={health} />
      <EntryFailureCard health={health} />
    </Grid>
  );
}

interface SectionProps {
  title: string;
}

function Section({ title, children }: PropsWithChildren<SectionProps>) {
  return (
    <Flex direction="column" gap={headerGap}>
      <Text style={{ color: "var(--primary-text-color)", fontSize: "18px" }}>
        {title}
      </Text>
      <Card style={{ flex: 1 }}>{children}</Card>
    </Flex>
  );
}

interface LabelValueDisplayProps {
  label: string;
  value: number;
  valueColor: string;
  pct: number;
}

export function LabelValueDisplay({
  value,
  label,
  valueColor,
  pct,
}: LabelValueDisplayProps) {
  return (
    <Flex direction="column">
      <Flex gap="2">
        <Text style={{ color: "var(--gray-11)" }}>{label}</Text>
        <Text style={{ color: "var(--gray-10)" }}>
          {compactSingleDecimalFormatter.format(pct * 100)}%
        </Text>
      </Flex>
      <Text style={{ color: valueColor }} size="8">
        {Math.round(value).toLocaleString()}
      </Text>
    </Flex>
  );
}

interface VerticalLabelValueDisplayProps {
  label: string;
  value: number;
  valueColor: string;
  pct?: number;
  size?: "lg";
}

export function VerticalLabelValueDisplay({
  value,
  label,
  valueColor,
  pct,
  size,
}: VerticalLabelValueDisplayProps) {
  return (
    <Flex direction="column">
      <Text style={{ color: "var(--gray-11)" }}>{label}</Text>
      <Text style={{ color: valueColor }} size={size === "lg" ? "8" : "6"}>
        {Math.round(value).toLocaleString()}
      </Text>
      {pct !== undefined && (
        <Text style={{ color: "var(--gray-10)" }} size="2">
          {compactSingleDecimalFormatter.format(pct * 100)}%
        </Text>
      )}
    </Flex>
  );
}

function EntryTotalCard({ health }: GossipHealthProps) {
  const pushTotal = useEmaValue(
    health.num_push_entries_rx_success + health.num_push_entries_rx_failure,
  );
  const pullTotal = useEmaValue(
    health.num_pull_response_entries_rx_success +
      health.num_pull_response_entries_rx_failure,
  );

  const pushSuccess = useEmaValue(health.num_push_entries_rx_success);
  const pullSuccess = useEmaValue(health.num_pull_response_entries_rx_success);

  const totalSuccess = pushSuccess + pullSuccess;
  const maxValue = Math.max(pushTotal, pullTotal, totalSuccess);

  const pushPct = clamp(pushSuccess / pushTotal, 0, 1);
  const pullPct = clamp(pullSuccess / pullTotal, 0, 1);

  const colors = [totalColor, ...sparklineColors];

  return (
    <Section title="Entries Success /s">
      <Flex gap="6">
        <Flex direction="column" gap="3">
          <VerticalLabelValueDisplay
            label="Total"
            value={totalSuccess}
            valueColor={totalColor}
            size="lg"
          />
          <Flex gap="3">
            <VerticalLabelValueDisplay
              label="Push"
              value={pushSuccess}
              valueColor={pushColor}
              pct={pushPct}
            />
            <VerticalLabelValueDisplay
              label="Pull"
              value={pullSuccess}
              valueColor={pullColor}
              pct={pullPct}
            />
          </Flex>
        </Flex>
        <GossipHealthSparklines
          values={[totalSuccess, pushSuccess, pullSuccess]}
          colors={colors}
          maxValue={maxValue}
        />
      </Flex>
    </Section>
  );
}

interface TwoValueCardProps {
  title: string;
  valueA: number;
  valueB: number;
  totalA: number;
  totalB: number;
  labelA: string;
  labelB: string;
}

function TwoValueCard({
  title,
  valueA,
  valueB,
  totalA,
  totalB,
  labelA,
  labelB,
}: TwoValueCardProps) {
  const pctA = valueA / totalA;
  const pctB = valueB / totalB;

  const maxValue = Math.max(totalA, totalB);

  return (
    <Section title={title}>
      <Flex gap="6" height="100%">
        <Flex direction="column" gap="3" minWidth="120px">
          <LabelValueDisplay
            label={labelA}
            value={valueA}
            valueColor={pushColor}
            pct={clamp(pctA, 0, 1)}
          />
          <LabelValueDisplay
            label={labelB}
            value={valueB}
            valueColor={pullColor}
            pct={clamp(pctB, 0, 1)}
          />
        </Flex>
        <GossipHealthSparklines
          values={[valueA, valueB]}
          colors={sparklineColors}
          maxValue={maxValue}
        />
      </Flex>
    </Section>
  );
}

function MessageFailureCard({ health }: GossipHealthProps) {
  const pushTotal = useEmaValue(
    health.num_push_messages_rx_success + health.num_push_messages_rx_failure,
  );
  const pullTotal = useEmaValue(
    health.num_pull_response_messages_rx_success +
      health.num_pull_response_messages_rx_failure,
  );

  const pushFail = useEmaValue(health.num_push_messages_rx_failure);
  const pullFail = useEmaValue(health.num_pull_response_messages_rx_failure);

  return (
    <TwoValueCard
      title="Message Failures /s"
      valueA={pushFail}
      valueB={pullFail}
      totalA={pushTotal}
      totalB={pullTotal}
      labelA="Push"
      labelB="Pull"
    />
  );
}

function EntryDuplicateCard({ health }: GossipHealthProps) {
  const pushTotal = useEmaValue(
    health.num_push_entries_rx_success + health.num_push_entries_rx_failure,
  );
  const pullTotal = useEmaValue(
    health.num_pull_response_entries_rx_success +
      health.num_pull_response_entries_rx_failure,
  );

  const pushDupe = useEmaValue(health.num_push_entries_rx_duplicate);
  const pullDupe = useEmaValue(health.num_pull_response_entries_rx_duplicate);

  return (
    <TwoValueCard
      title="Entry Duplicates /s"
      valueA={pushDupe}
      valueB={pullDupe}
      totalA={pushTotal}
      totalB={pullTotal}
      labelA="Push"
      labelB="Pull"
    />
  );
}

function EntryFailureCard({ health }: GossipHealthProps) {
  const pushTotal = useEmaValue(
    health.num_push_entries_rx_success + health.num_push_entries_rx_failure,
  );
  const pullTotal = useEmaValue(
    health.num_pull_response_entries_rx_success +
      health.num_pull_response_entries_rx_failure,
  );

  const pushFail = useEmaValue(
    health.num_push_entries_rx_failure - health.num_push_entries_rx_duplicate,
  );
  const pullFail = useEmaValue(
    health.num_pull_response_entries_rx_failure -
      health.num_pull_response_entries_rx_duplicate,
  );

  return (
    <TwoValueCard
      title="Entry Failures /s"
      valueA={pushFail}
      valueB={pullFail}
      totalA={pushTotal}
      totalB={pullTotal}
      labelA="Push"
      labelB="Pull"
    />
  );
}
