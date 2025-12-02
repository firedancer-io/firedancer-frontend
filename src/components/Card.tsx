import clsx from "clsx";
import styles from "./card.module.css";
import type { PropsWithChildren, HTMLAttributes } from "react";

interface CardProps {
  hideChildren?: boolean;
  isNarrow?: boolean;
}

export default function Card({
  children,
  hideChildren,
  isNarrow = false,
  ...props
}: PropsWithChildren<CardProps & HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      {...props}
      className={clsx(styles.card, isNarrow && styles.narrow, props.className)}
    >
      {!hideChildren && children}
    </div>
  );
}
