import { Box, Flex, Text } from "@radix-ui/themes";
import React, { useMemo } from "react";
import AutoSizer from "react-virtualized-auto-sizer";

const barColors = ["#003362", "#113B29", "#3F2700", "#202248", "#33255B"];

// const labelColor = "#B4B4B4";

interface DistributionBarData {
  value: number;
  label: string;
}

interface DistributionBarProps {
  data: DistributionBarData[];
  showPct?: boolean;
  sort?: boolean;
}

const nodeLimit = 5_000;

export default function DistributionBar({
  data,
  showPct,
  sort,
}: DistributionBarProps) {
  const total = data.reduce((sum, { value }) => sum + value, 0);
  let barData = sort ? data.toSorted((a, b) => b.value - a.value) : data;
  // .filter(({ value }) => {
  //   const isOther = value / total < 0.0001;
  //   if (isOther) {
  //     othersValue += value;
  //   }
  //   return !isOther;
  // });
  let othersValue = 0;
  if (barData.length > nodeLimit) {
    for (let i = nodeLimit; i < barData.length; i++) {
      othersValue += barData[i].value;
    }
    barData = barData.slice(0, nodeLimit);
    barData.push({ value: othersValue, label: "other" });
  }

  return (
    <div style={{ height: "30px", borderRadius: "4px", overflow: "hidden" }}>
      <AutoSizer>
        {({ height, width }) => {
          return (
            <Flex width={`${width}px`} height={`${height}px`}>
              {barData.map(({ value, label }, i) => {
                const color = barColors[i % barColors.length];
                const pct = value / total;
                const showLabel = pct * width > 30;
                return (
                  <div
                    key={label}
                    style={{
                      background: color,
                      // justifyItems: "center",
                      // lineHeight: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexGrow: value,
                      flexBasis: 0,
                    }}
                    // flexGrow={`${value}`}
                    // flexShrink={"1"}
                    // flexBasis={"0"}
                  >
                    {showLabel && (
                      <Text
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          margin: "0 8px",
                          // flex: "1 1 auto",
                          minWidth: 0,
                          display: "block",
                          color: "var(--gray-11)",
                          pointerEvents: "none",
                        }}
                      >
                        {label}
                        {showPct && ` ${Math.round(pct * 100)}%`}
                      </Text>
                    )}
                  </div>
                );
              })}
            </Flex>
          );
        }}
      </AutoSizer>
    </div>
  );
}
