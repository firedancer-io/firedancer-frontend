import { DropdownMenu } from "radix-ui";
import styles from "./nav.module.css";
import type { ButtonProps } from "@radix-ui/themes";
import { Button, Flex } from "@radix-ui/themes";
import SsidChartIcon from "@material-design-icons/svg/filled/ssid_chart.svg?react";
import AssessmentIcon from "@material-design-icons/svg/filled/assessment.svg?react";
import CalendarMonthIcon from "@material-design-icons/svg/filled/calendar_month.svg?react";
import CampaignIcon from "@material-design-icons/svg/filled/campaign.svg?react";
import KeyboardArrowDownIcon from "@material-design-icons/svg/filled/keyboard_arrow_down.svg?react";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import type { FC, SVGProps } from "react";
import { forwardRef, useEffect, useMemo } from "react";
import { containerElAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import type { RouteLabel } from "../../hooks/useCurrentRoute";
import { RouteLabelToPath, useCurrentRoute } from "../../hooks/useCurrentRoute";
import useNavigateLeaderSlot from "../../hooks/useNavigateLeaderSlot";
import { maxZIndex, slotsNavSpacing } from "../../consts";
import { clusterAtom } from "../../api/atoms";
import { getClusterColor } from "../../utils";
import { navButtonTextColor } from "../../colors";

interface NavLinkProps {
  label: RouteLabel;
  className?: string;
}

const RouteLabelToIcon: Record<RouteLabel, FC<SVGProps<SVGSVGElement>>> = {
  Overview: SsidChartIcon,
  Schedule: CalendarMonthIcon,
  Gossip: CampaignIcon,
  "Slot Details": AssessmentIcon,
};

interface NavLinkProps extends ButtonProps {
  label: RouteLabel;
  isActive: boolean;
  isLink: boolean;
  showDropdownIcon?: boolean;
}

const NavButton = forwardRef<HTMLButtonElement, NavLinkProps>(
  (
    { label, isActive, showDropdownIcon = false, isLink, ...props },
    forwardedRef,
  ) => {
    const cluster = useAtomValue(clusterAtom);
    const activeColor = getClusterColor(cluster);

    const Icon = RouteLabelToIcon[label];
    const path = RouteLabelToPath[label];

    const content = useMemo(() => {
      const iconFill = isActive ? activeColor : navButtonTextColor;

      return (
        <>
          <Icon className={styles.icon} fill={iconFill} />
          {label}
          {showDropdownIcon && (
            <KeyboardArrowDownIcon
              className={styles.dropdownIcon}
              fill={iconFill}
            />
          )}
        </>
      );
    }, [Icon, activeColor, isActive, label, showDropdownIcon]);

    return (
      <Button
        ref={forwardedRef}
        {...props}
        size="2"
        variant="soft"
        color="gray"
        className={clsx(styles.navLink, { [styles.active]: isActive })}
        style={{
          color: isActive ? activeColor : undefined,
        }}
        asChild={isLink}
      >
        {isLink ? <Link to={path}>{content}</Link> : content}
      </Button>
    );
  },
);

NavButton.displayName = "NavButton";

export function NavLinks() {
  const currentRoute = useCurrentRoute();

  return (
    <Flex gap={`${slotsNavSpacing}px`}>
      {Object.keys(RouteLabelToPath).map((label) => {
        const routeLabel = label as RouteLabel;
        return (
          <NavButton
            key={routeLabel}
            label={routeLabel}
            isActive={currentRoute === routeLabel}
            isLink
          />
        );
      })}
    </Flex>
  );
}

export function DropdownNav() {
  const containerEl = useAtomValue(containerElAtom);
  const currentRoute = useCurrentRoute();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <NavButton
          key={currentRoute}
          label={currentRoute}
          isActive
          showDropdownIcon
          isLink={false}
        />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal container={containerEl}>
        <DropdownMenu.Content
          side="bottom"
          sideOffset={5}
          className={styles.navDropdownContent}
          style={{ zIndex: maxZIndex }}
        >
          {Object.keys(RouteLabelToPath).map((label) => {
            const routeLabel = label as RouteLabel;
            if (routeLabel === currentRoute) return;

            return (
              <DropdownMenu.Item key={routeLabel} asChild>
                <NavButton
                  key={routeLabel}
                  label={routeLabel}
                  isActive={false}
                  isLink={true}
                />
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function NavHandler() {
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
  return null;
}
