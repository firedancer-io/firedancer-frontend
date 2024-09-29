import { Reset, Text } from "@radix-ui/themes";
import { Link } from "@tanstack/react-router";
import styles from "./navlink.module.css";

interface NavLinkProps {
  label: string;
  to: string;
}

export default function NavLink({ to, label }: NavLinkProps) {
  return (
    <Reset>
      <Link to={to} className={styles.navLink}>
        <Text>{label}</Text>
      </Link>
    </Reset>
  );
}
