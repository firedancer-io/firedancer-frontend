import { IconButton } from "@radix-ui/themes";
import clsx from "clsx";
import styles from "./navigation.module.css";
import ReadMore from "@material-design-icons/svg/filled/read_more.svg?react";
import { largeNavToggleHeight, navToggleHeight } from "../../consts";
import { useSlotsNavigation } from "../../hooks/useSlotsNavigation";

interface NavCollapseToggleProps {
  isFloating?: boolean;
  isLarge?: boolean;
}

export default function NavCollapseToggle({
  isFloating,
  isLarge,
}: NavCollapseToggleProps) {
  const { showNav, setIsNavCollapsed, showOnlyEpochBar } = useSlotsNavigation();

  const buttonSize = `${isLarge ? largeNavToggleHeight : navToggleHeight}px`;

  if (showOnlyEpochBar) {
    // Don't allow collapsing when only the epoch bar is shown
    return (
      <div
        style={{
          height: buttonSize,
          width: buttonSize,
        }}
      />
    );
  }

  return (
    <IconButton
      size="1"
      onClick={() => setIsNavCollapsed((prev) => !prev)}
      className={clsx(styles.toggleButton, {
        [styles.floating]: isFloating,
      })}
      style={{
        height: buttonSize,
        width: buttonSize,
      }}
    >
      <ReadMore
        className={clsx({
          [styles.lg]: isLarge,
          [styles.mirror]: showNav,
        })}
      />
    </IconButton>
  );
}
