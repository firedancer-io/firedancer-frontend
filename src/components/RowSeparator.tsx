import { Separator } from "@radix-ui/themes";
import styles from "./rowSeparator.module.css";
import { MarginProps } from "@radix-ui/themes/dist/esm/props/margin.props.js";

export default function RowSeparator({ my }: { my?: MarginProps["my"] }) {
  return <Separator size="4" my={my ?? "1"} className={styles.separator} />;
}
