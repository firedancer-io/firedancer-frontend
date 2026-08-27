import type { CSSProperties } from "react";
import clsx from "clsx";
import { legend } from "./const";
import styles from "./shreds.module.css";

export function ShredsChartLegend() {
  return (
    <div
      className="rt-Flex rt-r-fw-wrap rt-r-cg rt-r-rg"
      style={{ "--column-gap": "15px", "--row-gap": "5px" } as CSSProperties}
    >
      {Object.entries(legend).map(([label, color]) => {
        return (
          <div
            key={label}
            className="rt-Flex rt-r-gap rt-r-fs-0"
            style={{ "--gap": "5px" } as CSSProperties}
          >
            <div
              className={styles.legendColorBox}
              style={{ backgroundColor: color }}
            />
            <span className={clsx("rt-Text", styles.legendLabel)}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
