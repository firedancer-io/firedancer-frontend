import { Reset } from "@radix-ui/themes";
import { Link } from "@tanstack/react-router";
import fdFullLogo from "../../assets/firedancer.svg";
import fdLogo from "../../assets/firedancer_logo.svg";
import { useMedia } from "react-use";

export default function Logo() {
  const isWideScreen = useMedia("(min-width: 1366px)");

  return (
    <Reset>
      <Link to="/">
        <img src={isWideScreen ? fdFullLogo : fdLogo} alt="fd" />
      </Link>
    </Reset>
  );
}
