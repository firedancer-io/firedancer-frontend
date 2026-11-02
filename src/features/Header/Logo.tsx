import { Reset } from "@radix-ui/themes";
import { logoWidth } from "../../consts";
import { Link } from "@tanstack/react-router";
import fdLogo from "../../assets/firedancer_logo.svg";
import styles from "./logo.module.css";

export default function Logo() {
  return (
    <Reset>
      <Link to="/">
        <img
          className={styles.logo}
          width={logoWidth}
          src={fdLogo}
          alt="Firedancer"
        />
      </Link>
    </Reset>
  );
}
