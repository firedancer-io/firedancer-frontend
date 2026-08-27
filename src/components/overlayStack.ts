// Dynamic-import boundary for the floating overlay stack (tooltip,
// popover, dropdown menu, and their floating-ui/scroll-lock deps).
// Nothing on the default route opens an overlay before an interaction,
// so lazyOverlays.tsx loads this on the first pointer/keyboard gesture
// instead of shipping it in the entry chunk.
export { Tooltip } from "@radix-ui/themes";
export { DropdownMenu, Popover } from "radix-ui";
