import { Reset } from "@radix-ui/themes";
import { logoWidth } from "../../consts";
import { Link } from "@tanstack/react-router";
import fdLogo from "../../assets/firedancer_logo.svg";
import frLogo from "../../assets/frankendancer_logo.svg";
import styles from "./logo.module.css";
import { client, isFiredancer } from "../../client";

export default function Logo() {
  return (
    <Reset>
      <Link to="/">
        <img
          className={styles.logo}
          width={logoWidth}
          src={isFiredancer ? fdLogo : frLogo}
          alt={client}
        />
      </Link>
    </Reset>
  );
}
