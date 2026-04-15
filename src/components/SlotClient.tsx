import { useSlotInfo } from "../hooks/useSlotInfo";
import { memo } from "react";
import ClientIcons, { type ClientIconSize } from "./ClientIcons";

export default memo(function SlotClient({
  slot,
  size,
}: {
  slot: number;
  size: ClientIconSize;
}) {
  const { client } = useSlotInfo(slot);
  return <ClientIcons client={client} size={size} />;
});
