import type { PropsWithChildren } from "react";
import styles from "./uplotTooltip.module.css";

interface UplotTooltipProps {
  elId: string;
}
export default function UplotTooltip({
  elId,
  children,
}: PropsWithChildren<UplotTooltipProps>) {
  return (
    <div id={elId} className={styles.tooltip}>
      {children}
    </div>
  );
}
