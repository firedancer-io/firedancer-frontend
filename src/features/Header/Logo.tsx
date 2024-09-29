import { Reset } from "@radix-ui/themes";
import { Link } from "@tanstack/react-router";
import fdFullLogo from "../../assets/firedancer.svg";
import fdLogo from "../../assets/firedancer_logo.svg";
import { useWindowSize } from "react-use";

export default function Logo() {
  const { width } = useWindowSize();
  const isMediumScreen = width < 1366;

  return (
    <Reset>
      <Link to="/">
        <img src={isMediumScreen ? fdLogo : fdFullLogo} alt="fd" />
      </Link>
    </Reset>
  );
}
