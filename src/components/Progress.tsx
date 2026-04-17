import {
  Progress as RadixProgress,
  type ProgressProps as RadixProgressProps,
} from "@radix-ui/themes";
import clsx from "clsx";
import type { CSSProperties } from "react";
import styles from "./progress.module.css";

interface ProgressProps extends RadixProgressProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
}

export default function Progress({
  width,
  height = "3px",
  style,
  className,
  variant = "soft",
  ...props
}: ProgressProps) {
  return (
    <RadixProgress
      className={clsx(styles.progress, className)}
      style={
        {
          "--progress-width": width,
          "--progress-height": height,
          ...style,
        } as CSSProperties
      }
      variant={variant}
      {...props}
    />
  );
}
