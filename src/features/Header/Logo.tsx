import { Reset } from "@radix-ui/themes";
import { Link } from "@tanstack/react-router";
import fdFullLogo from "../../assets/firedancer.svg";
import fdLogo from "../../assets/firedancer_logo.svg";
import frFullLogo from "../../assets/frankendancer.svg";
import frLogo from "../../assets/frankendancer_logo.svg";
import { useMedia } from "react-use";
import { clientAtom } from "../../atoms";
import { ClientEnum } from "../../api/entities";
import type { Client } from "../../api/types";
import { useAtomValue } from "jotai";
import styles from "./logo.module.css";

const logos: {
  [key in Client]: {
    narrow: string;
    wide: string;
  };
} = {
  Frankendancer: {
    narrow: frLogo,
    wide: frFullLogo,
  },
  Firedancer: {
    narrow: fdLogo,
    wide: fdFullLogo,
  },
};

export default function Logo() {
  const isWideScreen = useMedia("(min-width: 1366px)");
  const client = useAtomValue(clientAtom);

  return (
    <Reset>
      <Link to="/">
        <img
          className={styles.logo}
          src={logos[client][isWideScreen ? "wide" : "narrow"]}
          alt={
            client === ClientEnum.Firedancer ? "Firedancer" : "Frankendancer"
          }
        />
      </Link>
    </Reset>
  );
}
