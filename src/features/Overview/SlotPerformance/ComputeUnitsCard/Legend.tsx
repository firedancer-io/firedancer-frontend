import React from "react";
import styles from "./computeUnits.module.css";
import { Text } from "@radix-ui/themes";

interface LegendProps {
  bankTileCount: number;
}

export default function Legend({ bankTileCount }: LegendProps) {
  const lineColors = ["#1E9C50", "#AE5511", "#CF321D", "#F40505"];

  return (
    <div className={styles.legend}>
      <Text className={styles.title}>Banks required</Text>
      <div className={styles.grid}>
        {lineColors.map((color, i) => {
          if (i >= bankTileCount) return null;

          const isOverflow =
            bankTileCount > lineColors.length && i === lineColors.length - 1;

          return (
            <React.Fragment key={color}>
              <svg width={isOverflow ? "70px" : "65px"} height="15px">
                <line
                  stroke={color}
                  strokeDasharray="3 3"
                  strokeWidth="1"
                  x1="2"
                  y1="7"
                  x2="65"
                  y2="7"
                />
              </svg>
              <Text style={{ textAlign: "left" }}>
                {isOverflow ? `${i + 1}+` : i + 1}
              </Text>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
