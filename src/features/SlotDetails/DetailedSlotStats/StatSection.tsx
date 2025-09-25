import { Heading } from "@radix-ui/themes";
import type { PropsWithChildren } from "react";
import RowSeparator from "../../../components/RowSeparator";

interface SectionProps {
  title: string;
  lg?: boolean;
}

export function Section({
  title,
  children,
  lg,
}: PropsWithChildren<SectionProps>) {
  return (
    <div style={{ flex: lg ? 1.5 : 1, flexShrink: 0, flexBasis: 0 }}>
      <Heading size="3">{title}</Heading>
      <RowSeparator mb="2" />
      {children}
    </div>
  );
}
