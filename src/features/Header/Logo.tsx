import { Reset } from "@radix-ui/themes";
import { Link } from "@tanstack/react-router";
import fdLogo from "../../assets/firedancer_logo.svg";

export default function Logo() {
  return (
    <Reset>
      <Link to="/" style={{ lineHeight: 0 }}>
        <img src={fdLogo} alt="fd" />
      </Link>
    </Reset>
  );
}
