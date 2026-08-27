import clsx from "clsx";
import styles from "./cardHeader.module.css";

interface CardHeaderProps {
  text: string;
}

export default function CardHeader({ text }: CardHeaderProps) {
  return <span className={clsx("rt-Text", styles.text)}>{text}</span>;
}
