import * as React from "react";
import { Tooltip, type TooltipProps } from "@radix-ui/themes";

const ConditionalTooltip = React.forwardRef<
  React.ElementRef<typeof Tooltip>,
  TooltipProps
>(({ children, ...props }, ref) => {
  if (!props.content) {
    return <>{children}</>;
  }

  return (
    <Tooltip ref={ref} {...props}>
      {children}
    </Tooltip>
  );
});

ConditionalTooltip.displayName = "ConditionalTooltip";

export default ConditionalTooltip;
