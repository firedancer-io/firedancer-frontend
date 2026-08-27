import type { PropsWithChildren } from "react";
import type { TooltipProps } from "@radix-ui/themes";
import { useOverlayStack } from "./lazyOverlays";

/** Drop-in themes Tooltip: children bare until content and the stack exist */
export default function LazyTooltip({
  children,
  ...props
}: PropsWithChildren<TooltipProps>) {
  const overlays = useOverlayStack();
  if (!overlays || !props.content) return <>{children}</>;
  return <overlays.Tooltip {...props}>{children}</overlays.Tooltip>;
}
