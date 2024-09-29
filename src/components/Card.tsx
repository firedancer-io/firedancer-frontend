import styles from "./card.module.css";
import { CSSProperties, PropsWithChildren } from "react";

interface CardProps{
  hideChildren?: boolean;
  style?: CSSProperties;
}

export default function Card({ children, hideChildren , style}: PropsWithChildren<CardProps>) {
  return <div className={styles.card} style={style}>{!hideChildren && children}</div>;
}
