import { Flex, Text, Tooltip } from "@radix-ui/themes";
import AutoSizer from "react-virtualized-auto-sizer";
import styles from "./distributionBars.module.css";
import { formatNumberLamports } from "../../../Overview/ValidatorsCard/formatAmt";
import { maxSolDecimals } from "../../../../consts";

const barColors = ["#003362", "#113B29", "#3F2700", "#202248", "#33255B"];

interface DistributionBarData {
  value: number;
  label: string;
}

interface DistributionBarProps {
  data: DistributionBarData[];
  showPct?: boolean;
  sort?: boolean;
  onItemClick?: (item: { label: string; value: number }) => void;
}

const nodeLimit = 5_000;

export default function DistributionBar({
  data,
  showPct,
  sort,
  onItemClick,
}: DistributionBarProps) {
  const total = data.reduce((sum, { value }) => sum + value, 0);
  let barData = sort ? data.toSorted((a, b) => b.value - a.value) : data;
  let othersValue = 0;
  if (barData.length > nodeLimit) {
    for (let i = nodeLimit; i < barData.length; i++) {
      othersValue += barData[i].value;
    }
    barData = barData.slice(0, nodeLimit);
    barData.push({ value: othersValue, label: "other" });
  }

  return (
    <div className={styles.container}>
      <AutoSizer>
        {({ height, width }) => {
          return (
            <Flex width={`${width}px`} height={`${height}px`}>
              {barData.map(({ value, label }, i) => {
                const color = barColors[i % barColors.length];
                const decimalPct = value / total;
                const pct = decimalPct * 100;
                const formattedPct =
                  pct > 1 ? `${Math.round(pct)}%` : `${pct.toFixed(2)}%`;
                const showLabel = decimalPct * width > 30;
                return (
                  <Tooltip
                    key={label}
                    content={
                      <>
                        <Text weight="bold">{label}</Text>
                        <br />
                        <Text>{`Income: ${formatNumberLamports(value, maxSolDecimals)} SOL (${formattedPct})`}</Text>
                      </>
                    }
                    side="bottom"
                    disableHoverableContent
                  >
                    {onItemClick ? (
                      <Flex
                        asChild
                        className={styles.clickable}
                        minWidth="0"
                        align="center"
                        justify="center"
                        flexBasis="0"
                        style={{ background: color, flexGrow: value }}
                      >
                        <button
                          aria-label={`Filter by ${label} (${formattedPct})`}
                          onClick={() => onItemClick({ label, value })}
                        >
                          <Label
                            showLabel={showLabel}
                            label={label}
                            showPct={showPct}
                            formattedPct={formattedPct}
                          />
                        </button>
                      </Flex>
                    ) : (
                      <Flex
                        minWidth="0"
                        align="center"
                        justify="center"
                        flexBasis="0"
                        style={{ background: color, flexGrow: value }}
                      >
                        <Label
                          showLabel={showLabel}
                          label={label}
                          showPct={showPct}
                          formattedPct={formattedPct}
                        />
                      </Flex>
                    )}
                  </Tooltip>
                );
              })}
            </Flex>
          );
        }}
      </AutoSizer>
    </div>
  );
}

function Label({
  showLabel,
  label,
  showPct,
  formattedPct,
}: {
  showLabel?: boolean;
  label: string;
  showPct?: boolean;
  formattedPct: string;
}) {
  if (!showLabel) return null;
  return (
    <Text mx="2" className={styles.label} truncate>
      {label}
      {showPct && ` ${formattedPct}`}
    </Text>
  );
}
