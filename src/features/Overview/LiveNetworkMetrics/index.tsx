import { useAtomValue } from "jotai";
import {
  liveNetworkMetricsAtom,
  networkMetricsEmaEgressAtom,
  networkMetricsEmaIngressAtom,
} from "../../../api/atoms";
import Card from "../../../components/Card";
import { Flex, Table, Text } from "@radix-ui/themes";
import tableStyles from "../../Gossip/table.module.css";
import {
  networkMaxByteValues,
  networkProtocols,
  type NetworkMetricsCardType,
} from "./consts";
import { formatBytesAsBits } from "../../../utils";
import { Bars } from "../../StartupProgress/Firedancer/Bars";
import TileSparkLine from "../SlotPerformance/TileSparkLine";
import { headerGap } from "../../Gossip/consts";
import { useMemo, useRef, type CSSProperties } from "react";
import styles from "./liveNetworkMetrics.module.css";
import { sum } from "lodash";
import { tileChartDarkBackground } from "../../../colors";
import { isFrankendancer } from "../../../client";
import type { HistoryEntry } from "../../../api/worker/types";
import { useEmaValue } from "../../../hooks/useEma";
import clsx from "clsx";

const chartHeight = 18;

export default function LiveNetworkMetrics() {
  const liveNetworkMetrics = useAtomValue(liveNetworkMetricsAtom);
  const ingressEma = useAtomValue(networkMetricsEmaIngressAtom);
  const egressEma = useAtomValue(networkMetricsEmaEgressAtom);

  if (!liveNetworkMetrics) return;

  return (
    <Flex wrap="wrap" gap="4">
      <NetworkMetricsCard
        metrics={liveNetworkMetrics.ingress}
        history={ingressEma.history}
        type="Ingress"
      />
      <NetworkMetricsCard
        metrics={liveNetworkMetrics.egress}
        history={egressEma.history}
        type="Egress"
      />
    </Flex>
  );
}

interface NetworkMetricsCardProps {
  metrics: number[];
  history: HistoryEntry[];
  type: NetworkMetricsCardType;
}

function NetworkMetricsCard({
  metrics,
  history,
  type,
}: NetworkMetricsCardProps) {
  return (
    <Card style={{ flexGrow: 1 }}>
      <Flex direction="column" height="100%" gap={headerGap}>
        <Text className={tableStyles.headerText}>Network {type}</Text>
        <Table.Root
          variant="ghost"
          className={clsx(tableStyles.root, styles.table)}
          size="1"
          style={{ "--bar-height": `${chartHeight}px` } as CSSProperties}
        >
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell width="60px">
                Protocol
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right" width="80px">
                Current
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell
                minWidth={{
                  xl: "250px",
                  lg: "160px",
                  md: "100px",
                  initial: "60px",
                }}
              >
                Utilization
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell
                align="right"
                width={{
                  xl: "240px",
                  lg: "200px",
                  md: "100px",
                  initial: "200px",
                }}
              >
                History (1m)
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {metrics.map((value, i) => {
              const protocol = networkProtocols[i];
              if (
                isFrankendancer &&
                (protocol === "gossip" || protocol === "repair")
              ) {
                return;
              }
              return (
                <TableRow
                  key={i}
                  label={protocol}
                  value={value}
                  maxValue={networkMaxByteValues[type][protocol]}
                  history={history}
                  mapHistory={(values) => values[i] ?? 0}
                />
              );
            })}
            <TableRow
              label="Total"
              value={sum(metrics)}
              maxValue={networkMaxByteValues[type]["Total"]}
              history={history}
              mapHistory={sum}
              className={styles.totalRow}
            />
          </Table.Body>
        </Table.Root>
      </Flex>
    </Card>
  );
}

const defaultMaxValue = 100_000_000;

function toUtilization(value: number, maxValue: number) {
  return Math.min(1, value / maxValue);
}

const emaOptions = { halfLifeMs: 1_000 };

interface TableRowProps {
  label: string;
  value: number;
  maxValue?: number;
  history: HistoryEntry[];
  mapHistory: (values: number[]) => number;
  className?: string;
}

function TableRow({
  label,
  value,
  maxValue = defaultMaxValue,
  history,
  mapHistory,
  className,
}: TableRowProps) {
  const emaValue = useEmaValue(value, emaOptions);
  const formattedValue = formatBytesAsBits(emaValue);
  const utilization = toUtilization(emaValue, maxValue);

  const mapHistoryRef = useRef(mapHistory);
  mapHistoryRef.current = mapHistory;

  const initialHistory = useMemo(
    () =>
      history.map((h) => ({
        ts: h.ts,
        value: toUtilization(mapHistoryRef.current(h.values), maxValue),
      })),
    [history, maxValue],
  );

  return (
    <Table.Row className={clsx(styles.row, className)}>
      <Table.RowHeaderCell>{label}</Table.RowHeaderCell>
      <Table.Cell align="right">
        {formattedValue.value} {formattedValue.unit}
      </Table.Cell>
      <Table.Cell className={styles.chart}>
        <Flex align="center">
          <Bars value={emaValue} max={maxValue} barWidth={2} />
        </Flex>
      </Table.Cell>
      <Table.Cell className={styles.chart}>
        <TileSparkLine
          value={utilization}
          history={initialHistory}
          background={tileChartDarkBackground}
          windowMs={60_000}
          height={chartHeight}
          updateIntervalMs={500}
          tickMs={1_000}
        />
      </Table.Cell>
    </Table.Row>
  );
}
