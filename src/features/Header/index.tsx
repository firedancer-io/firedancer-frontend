import { Box, Flex } from "@radix-ui/themes";
import IdentityKey from "./IdentityKey";
import Cluster from "./Cluster";
import styles from "./header.module.css";
import { useEffect } from "react";
import useNavigateLeaderSlot from "../../hooks/useNavigateLeaderSlot";
import Logo from "./Logo";
import EpochBar from "../EpochBar";
import CluserIndicator from "./ClusterIndicator";
import NavLinks from "./NavLinks";
import MenuNavLinks from "./MenuNavLinks";

export default function Header() {
  // TODO move somehere it won't trigger re-renders
  const nav = useNavigateLeaderSlot();
  useEffect(() => {
    const navigate = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft") {
        nav.navPrevLeaderSlot();
      } else if (e.code === "ArrowRight") {
        nav.navNextLeaderSlot();
      }
    };

    document.addEventListener("keydown", navigate);

    return () => document.removeEventListener("keydown", navigate);
  }, [nav]);

  return (
    <Box className={styles.headerContainer}>
      <Flex className={styles.headerInner} direction="column">
        <CluserIndicator />
        <Flex className={styles.headerRow} justify="between" align="center">
          <MenuNavLinks />
          <Flex gap="2" align="start">
            <Logo />
            <Cluster />
          </Flex>
          <NavLinks />
          <IdentityKey />
        </Flex>
        <EpochBar />
      </Flex>
    </Box>
  );
}
