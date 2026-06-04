import {
  Progress as RadixProgress,
  type ProgressProps as RadixProgressProps,
} from "@radix-ui/themes";
import clsx from "clsx";
import type { CSSProperties } from "react";
import styles from "./progress.module.css";

interface ProgressProps extends Omit<RadixProgressProps, "color"> {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  color?: CSSProperties["color"];
}

export default function Progress({
  width = "100%",
  height = "3px",
  color,
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
          width,
          height,
          "--progress-background-color": color,
          ...style,
        } as CSSProperties
      }
      variant={variant}
      {...props}
    />
  );
}
