import { type TextProps, Text } from "@radix-ui/themes";
import type { PropsWithChildren } from "react";
import styles from "./monoText.module.css";
import clsx from "clsx";

export default function MonoText({
  children,
  ...props
}: PropsWithChildren<TextProps>) {
  return (
    <Text {...props} className={clsx(styles.text, props.className)}>
      {children}
    </Text>
  );
}
