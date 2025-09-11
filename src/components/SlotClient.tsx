import { useSlotInfo } from "../hooks/useSlotInfo";
import AnzaLogo from "../assets/anza_logo.svg";
import FrankendancerLogo from "../assets/frankendancer_logo.svg";
import { memo } from "react";
import styles from "./slotClient.module.css";
import clsx from "clsx";

export default memo(function SlotClient({
  slot,
  size,
}: {
  slot: number;
  size: "small" | "large";
}) {
  const { client } = useSlotInfo(slot);
  const className = clsx(styles[`${size}Icon`]);
  if (!client) return <div className={className} />;
  return client === "Frankendancer" ? (
    <img
      src={FrankendancerLogo}
      alt="Frankendancer Logo"
      className={className}
    />
  ) : (
    <img src={AnzaLogo} alt="Anza Logo" className={className} />
  );
});
