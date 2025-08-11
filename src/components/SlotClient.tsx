import { useSlotInfo } from "../hooks/useSlotInfo";
import AnzaLogo from "../assets/anza_logo.svg";
import FrankendancerLogo from "../assets/frankendancer_logo.svg";

export function SlotClient({
  slot,
  size = "11px",
}: {
  slot: number;
  size?: string;
}) {
  const { client } = useSlotInfo(slot);
  if (!client) return;
  return client === "Frankendancer" ? (
    <img
      src={FrankendancerLogo}
      alt="Frankendancer Logo"
      width={size}
      height={size}
    />
  ) : (
    <img src={AnzaLogo} alt="Anza Logo" width={size} height={size} />
  );
}
