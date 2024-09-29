import { Text } from "@radix-ui/themes";
import { Bar, BarTooltipProps } from "@nivo/bar";
import AutoSizer from "react-virtualized-auto-sizer";
import styles from "./chart.module.css";
import { useMemo, useReducer } from "react";
import { lamportsPerSlot, lamportsPerSol } from "../../../consts";
import { useInterval } from "react-use";

const balances = [{ id: 0, value: 147 }];
for (let i = 0; i < 96; i++) {
  balances.push({
    id: i + 1,
    value: balances[balances.length - 1].value - Math.random() * 3.3,
  });
}

const slotsPerBar = 4000;

interface DataRow {
  id: number;
  value: number;
  state: string;
}

function dataReducer(
  _: DataRow[],
  { currentSlot, startSlot, endSlot, startingBalance }: ChartProps
): DataRow[] {
  const size = Math.trunc((endSlot - startSlot) / slotsPerBar);

  if (!size) return [];

  return new Array(size).fill(0).map((_, i) => {
    const slot = i * slotsPerBar + startSlot;
    const isCurrent = slot < currentSlot && slotsPerBar + slot > currentSlot;
    return {
      id: i,
      value:
        (startingBalance - i * lamportsPerSlot * slotsPerBar) / lamportsPerSol,
      state: isCurrent
        ? "current"
        : slot <= currentSlot - slotsPerBar
          ? "past"
          : "future",
    };
  });
}

interface ChartProps {
  startingBalance: number;
  currentBalance: number;
  endingBalance: number;
  startSlot: number;
  currentSlot: number;
  endSlot: number;
}

export default function Chart(props: ChartProps) {
  const [data, update] = useReducer(dataReducer, []);

  useInterval(() => update(props), data.length ? 60_000 : 5_000);

  const colors = useMemo(() => {
    return data.map(({ state, value }) => {
      if (value < 0) return "#FF3C3C";
      if (state === "past") {
        return "#3283BD80";
      }
      if (state === "current") {
        return "#BDF3FF";
      }
      if (state === "future") {
        return "#595959";
      }

      return "white";
    });
  }, [data]);

  return (
    <AutoSizer>
      {({ height, width }) => {
        return (
          <Bar
            height={height}
            width={width}
            data={data}
            enableLabel={false}
            enableGridX={false}
            enableGridY={false}
            colors={colors}
            colorBy="indexValue"
            padding={0.33}
            tooltip={Tooltip}
            animate={false}
          />
        );
      }}
    </AutoSizer>
  );
}

function Tooltip(
  props: BarTooltipProps<{
    id: number;
    value: number;
  }>
) {
  return (
    <div className={styles.tooltip}>
      <Text>{props.formattedValue}&nbsp;SOL</Text>
    </div>
  );
}
