import type { PropsWithChildren } from "react";
import { Portal } from "radix-ui";

import styles from "./uplotTooltip.module.css";
import { containerElAtom } from "../atoms";
import { useAtomValue } from "jotai";

interface UplotTooltipProps {
  elId: string;
}
export default function UplotTooltip({
  elId,
  children,
}: PropsWithChildren<UplotTooltipProps>) {
  const containerEl = useAtomValue(containerElAtom);

  return (
    <Portal.Root container={containerEl} id={elId} className={styles.tooltip}>
      {children}
    </Portal.Root>
  );
}
