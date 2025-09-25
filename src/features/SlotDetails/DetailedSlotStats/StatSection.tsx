import { Heading } from "@radix-ui/themes";
import type { PropsWithChildren } from "react";
import RowSeparator from "../../../components/RowSeparator";

interface SectionProps {
  title: string;
}

export function Section({ title, children }: PropsWithChildren<SectionProps>) {
  return (
    <div style={{flex: 1}}>
      <Heading size="3">{title}</Heading>
      <RowSeparator mb="2" />
      {children}
    </div>
  );
}
