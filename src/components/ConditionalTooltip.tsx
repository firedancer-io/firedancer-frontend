import { Tooltip, type TooltipProps } from "@radix-ui/themes";
import type { PropsWithChildren } from "react";

export default function ConditionalTooltip({
  children,
  ...props
}: PropsWithChildren<TooltipProps>) {
  if (!props.content) {
    return <>{children}</>;
  }

  return <Tooltip {...props}>{children}</Tooltip>;
}
