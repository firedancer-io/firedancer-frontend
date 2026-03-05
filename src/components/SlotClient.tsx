import { useSlotInfo } from "../hooks/useSlotInfo";
import AnzaLogo from "../assets/anza_circle_logo.svg";
import AnzaJitoLogo from "../assets/anza_jito_circle_logo.svg";
import AnzaBamLogo from "../assets/anza_jitobam_circle_logo.svg";
import AnzaPaladinLogo from "../assets/anza_paladin_circle_logo.svg";
import AnzaRakuraiLogo from "../assets/anza_rakurai_circle_logo.svg";
import FiredancerLogo from "../assets/firedancer_circle_logo.svg";
import FrankendancerLogo from "../assets/frankendancer_circle_logo.svg";
import { memo } from "react";
import styles from "./slotClient.module.css";
import clsx from "clsx";
import { ClientName } from "../consts";

const ClientImgs: Record<ClientName, { src: string; alt: string } | null> = {
  [ClientName.Frankendancer]: {
    src: FrankendancerLogo,
    alt: "Frankendancer Logo",
  },
  [ClientName.Firedancer]: {
    src: FiredancerLogo,
    alt: "Firedancer Logo",
  },
  [ClientName.Agave]: {
    src: AnzaLogo,
    alt: "Anza Logo",
  },
  [ClientName.AgaveJito]: {
    src: AnzaJitoLogo,
    alt: "Anza Jito Logo",
  },
  [ClientName.AgavePaladin]: {
    src: AnzaPaladinLogo,
    alt: "Anza Paladin Logo",
  },
  [ClientName.AgaveBam]: {
    src: AnzaBamLogo,
    alt: "Anza Bam Logo",
  },
  [ClientName.AgaveRakurai]: {
    src: AnzaRakuraiLogo,
    alt: "Anza Rakurai Logo",
  },
  [ClientName.Sig]: null,
};

export default memo(function SlotClient({
  slot,
  size,
}: {
  slot: number;
  size: "small" | "large";
}) {
  const { client } = useSlotInfo(slot);
  const className = clsx(styles[`${size}Icon`]);

  const image = client ? ClientImgs[client] : undefined;

  if (!image) return null;
  return <img src={image.src} alt={image.alt} className={className} />;
});
