import styles from "./card.module.css";
import type { PropsWithChildren, HTMLAttributes } from "react";

interface CardProps {
  hideChildren?: boolean;
}

export default function Card({
  children,
  hideChildren,
  ...props
}: PropsWithChildren<CardProps & HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={styles.card} {...props}>
      {!hideChildren && children}
    </div>
  );
}
