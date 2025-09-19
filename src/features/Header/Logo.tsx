import { Reset } from "@radix-ui/themes";
import { logoWidth } from "../../consts";
import { Link } from "@tanstack/react-router";
import fdLogo from "../../assets/firedancer_logo.svg";
import frLogo from "../../assets/frankendancer_logo.svg";
import { clientAtom } from "../../atoms";
import { ClientEnum } from "../../api/entities";
import { useAtomValue } from "jotai";
import styles from "./logo.module.css";

export default function Logo() {
  const client = useAtomValue(clientAtom);

  return (
    <Reset>
      <Link to="/">
        <img
          className={styles.logo}
          width={logoWidth}
          src={client === ClientEnum.Firedancer ? fdLogo : frLogo}
          alt={
            client === ClientEnum.Firedancer ? "Firedancer" : "Frankendancer"
          }
        />
      </Link>
    </Reset>
  );
}
