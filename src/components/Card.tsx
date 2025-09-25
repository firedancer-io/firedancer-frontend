import clsx from "clsx";
import styles from "./card.module.css";
import type { PropsWithChildren, HTMLAttributes } from "react";

interface CardProps {
  hideChildren?: boolean;
  includeBg?: boolean;
}

export default function Card({
  children,
  hideChildren,
  includeBg = true,
  ...props
}: PropsWithChildren<CardProps & HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={clsx(styles.card, { [styles.includeBg]: includeBg })}
      {...props}
    >
      {!hideChildren && children}
    </div>
  );
}
