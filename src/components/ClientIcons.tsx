import AnzaLogo from "../assets/anza_circle_logo.svg";
import AnzaJitoLogo from "../assets/anza_jito_circle_logo.svg";
import AnzaBamLogo from "../assets/anza_jitobam_circle_logo.svg";
import AnzaPaladinLogo from "../assets/anza_paladin_circle_logo.svg";
import AnzaRakuraiLogo from "../assets/anza_rakurai_circle_logo.svg";
import AnzaHarmonicLogo from "../assets/anza_harmonic_circle_logo.svg";
import FiredancerLogo from "../assets/firedancer_circle_logo.svg";
import FiredancerHarmonicLogo from "../assets/firedancer_harmonic_circle_logo.svg";
import FrankendancerLogo from "../assets/frankendancer_circle_logo.svg";
import FrankendancerHarmonicLogo from "../assets/frankendancer_harmonic_circle_logo.svg";
import EmptyClientsLogo from "../assets/empty_clients_logo.svg";
import { memo } from "react";
import styles from "./clientIcons.module.css";
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
  [ClientName.FiredancerHarmonic]: {
    src: FiredancerHarmonicLogo,
    alt: "Firedancer Harmonic Logo",
  },
  [ClientName.AgaveHarmonic]: {
    src: AnzaHarmonicLogo,
    alt: "Anza Harmonic Logo",
  },
  [ClientName.FrankendancerHarmonic]: {
    src: FrankendancerHarmonicLogo,
    alt: "Frankendancer Harmonic Logo",
  },
};

export type ClientIconSize = "small" | "large" | "xlarge";

interface ClientProps {
  client: ClientName | undefined;
  size: ClientIconSize;
  showPlaceholder?: boolean;
  className?: string;
  placeholderClassName?: string;
}

export default memo(function Client({
  client,
  size,
  showPlaceholder,
  className,
  placeholderClassName,
}: ClientProps) {
  const classNames = clsx(styles[`${size}Icon`], className);

  const image = client ? ClientImgs[client] : undefined;

  if (image)
    return <img src={image.src} alt={image.alt} className={classNames} />;
  if (showPlaceholder)
    return (
      <img
        src={EmptyClientsLogo}
        alt="Empty clients logo"
        className={clsx(classNames, placeholderClassName)}
      />
    );
  return null;
});
