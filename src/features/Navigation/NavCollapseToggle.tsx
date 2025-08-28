import { IconButton } from "@radix-ui/themes";
import clsx from "clsx";
import { useAtom } from "jotai";
import { isNavCollapsedAtom } from "../../atoms";
import styles from "./navigation.module.css";
import ReadMore from "@material-design-icons/svg/filled/read_more.svg?react";
import { largeNavToggleHeight, navToggleHeight } from "../../consts";

interface NavCollapseToggleProps {
  isFloating?: boolean;
  isLarge?: boolean;
}

export default function NavCollapseToggle({
  isFloating,
  isLarge,
}: NavCollapseToggleProps) {
  const [isNavCollapsed, setIsNavCollapsed] = useAtom(isNavCollapsedAtom);

  const buttonSize = `${isLarge ? largeNavToggleHeight : navToggleHeight}px`;
  const iconSize = isLarge ? "18px" : "15px";

  return (
    <IconButton
      size="1"
      onClick={() => setIsNavCollapsed((prev) => !prev)}
      className={clsx(styles.toggleButton, { [styles.floating]: isFloating })}
      style={{
        height: buttonSize,
        width: buttonSize,
      }}
    >
      <ReadMore
        preserveAspectRatio="true"
        className={clsx({
          [styles.mirror]: !isNavCollapsed,
        })}
        style={{
          height: iconSize,
        }}
      />
    </IconButton>
  );
}
