import { useSlotInfo } from "../hooks/useSlotInfo";
import AnzaLogo from "../assets/anza_logo.svg";
import FiredancerLogo from "../assets/firedancer_logo_circle.svg";
import FrankendancerLogo from "../assets/frankendancer_logo_circle.svg";
import { memo } from "react";
import styles from "./slotClient.module.css";
import clsx from "clsx";
import { ClientName } from "../consts";
import { isAgave } from "../utils";

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

  if (client === ClientName.Firedancer) {
    return (
      <img src={FiredancerLogo} alt="Firedancer Logo" className={className} />
    );
  }

  if (client === ClientName.Frankendancer) {
    return (
      <img
        src={FrankendancerLogo}
        alt="Frankendancer Logo"
        className={className}
      />
    );
  }

  if (isAgave(client)) {
    return <img src={AnzaLogo} alt="Anza Logo" className={className} />;
  }

  return <div className={className} />;
});
