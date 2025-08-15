import { DropdownMenu, ToggleGroup } from "radix-ui";
import styles from "./nav.module.css";
import { Button, Reset, Text } from "@radix-ui/themes";
import {
  BarChartIcon,
  CalendarIcon,
  SpeakerLoudIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { forwardRef, useEffect, useMemo } from "react";
import { containerElAtom } from "../../atoms";
import { useAtomValue } from "jotai";
import type { RouteLabel } from "../../hooks/useCurrentRoute";
import { RouteLabelToPath, useCurrentRoute } from "../../hooks/useCurrentRoute";
import useNavigateLeaderSlot from "../../hooks/useNavigateLeaderSlot";

interface NavLinkProps {
  label: RouteLabel;
  className?: string;
}

const RouteLabelToIcon: Record<RouteLabel, React.ReactNode> = {
  Overview: <BarChartIcon />,
  Schedule: <CalendarIcon />,
  Gossip: <SpeakerLoudIcon />,
  "Slot Details": <BarChartIcon />,
};

const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ label, className }, _) => {
    const icon = RouteLabelToIcon[label];
    const path = RouteLabelToPath[label];
    return (
      <Reset>
        <Link to={path} className={className}>
          {icon}
          <Text>{label}</Text>
        </Link>
      </Reset>
    );
  },
);
NavLink.displayName = "NavLink";

export function ToggleNav() {
  return (
    <ToggleGroup.Root
      type="single"
      className={styles.navToggleGroup}
      aria-label="Navigation"
    >
      <ToggleGroup.Item value="/" asChild>
        <NavLink
          label="Overview"
          className={clsx(
            styles.navToggleItem,
            styles.startItem,
            styles.overview,
          )}
        />
      </ToggleGroup.Item>
      <ToggleGroup.Item value="/slotDetails" asChild>
        <NavLink
          label="Slot Details"
          className={clsx(styles.navToggleItem, styles.slotDetails)}
        />
      </ToggleGroup.Item>
      <ToggleGroup.Item value="/leaderSchedule" asChild>
        <NavLink
          label="Schedule"
          className={clsx(styles.navToggleItem, styles.schedule)}
        />
      </ToggleGroup.Item>
      <ToggleGroup.Item value="/gossip" asChild>
        <NavLink
          label="Gossip"
          className={clsx(styles.navToggleItem, styles.gossip, styles.endItem)}
        />
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  );
}

export function DropdownNav() {
  const containerEl = useAtomValue(containerElAtom);

  const currentRoute = useCurrentRoute();
  const currentIcon = useMemo(() => {
    return RouteLabelToIcon[currentRoute];
  }, [currentRoute]);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          className={clsx(
            styles.navDropdownTrigger,
            currentRoute === "Overview" && styles.overview,
            currentRoute === "Slot Details" && styles.slotDetails,
            currentRoute === "Schedule" && styles.schedule,
            currentRoute === "Gossip" && styles.gossip,
          )}
        >
          {currentIcon}
          {currentRoute}
          <ChevronDownIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={containerEl}>
        <DropdownMenu.Content className={styles.navDropdownContent}>
          <DropdownMenu.Item asChild>
            <NavLink
              label="Overview"
              className={clsx(styles.navDropdownItem, styles.overview)}
            />
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <NavLink
              label="Slot Details"
              className={clsx(styles.navDropdownItem, styles.slotDetails)}
            />
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <NavLink
              label="Schedule"
              className={clsx(styles.navDropdownItem, styles.schedule)}
            />
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <NavLink
              label="Gossip"
              className={clsx(styles.navDropdownItem, styles.gossip)}
            />
          </DropdownMenu.Item>
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
