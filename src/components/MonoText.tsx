import { type TextProps, Text } from "@radix-ui/themes";
import type { PropsWithChildren } from "react";
import clsx from "clsx";

export default function MonoText({
  children,
  ...props
}: PropsWithChildren<TextProps>) {
  return (
    <Text {...props} className={clsx("mono-text", props.className)}>
      {children}
    </Text>
  );
}
