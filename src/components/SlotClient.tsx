import { useSlotInfo } from "../hooks/useSlotInfo";
import { memo } from "react";
import ClientIcons from "./ClientIcons";

export default memo(function SlotClient({
  slot,
  size,
}: {
  slot: number;
  size: "small" | "large";
}) {
  const { client } = useSlotInfo(slot);
  return <ClientIcons client={client} size={size} />;
});
