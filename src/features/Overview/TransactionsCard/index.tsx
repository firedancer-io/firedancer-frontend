import type { CSSProperties } from "react";
import clsx from "clsx";
import CardHeader from "../../../components/CardHeader";
import Chart from "./Chart";
import Card from "../../../components/Card";
import styles from "./transactionsCard.module.css";
import TransactionStats from "./TransactionStats";

export default function TransactionsCard({
  className,
}: {
  className?: string;
}) {
  return (
    <Card className={className}>
      <div
        className="rt-Flex rt-r-fd-column rt-r-gap-2 rt-r-h"
        style={{ "--height": "100%" } as CSSProperties}
      >
        <CardHeader text="Transactions" />
        <div className="rt-Flex rt-r-gap-4 rt-r-fg-1">
          <TransactionStats />
          <div className="rt-Flex rt-r-fd-column rt-r-fg-1">
            <div
              className="rt-Box rt-r-min-w rt-r-min-h rt-r-position-relative rt-r-overflow-hidden rt-r-fg-1"
              style={
                {
                  "--min-width": "180px",
                  "--min-height": "80px",
                } as CSSProperties
              }
            >
              <Chart />
            </div>
            <div className="rt-Flex rt-r-jc-space-between">
              <span className={clsx("rt-Text", styles.axisText)}>
                ~ 1min ago
              </span>
              <span className={clsx("rt-Text", styles.axisText)}>Now</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
