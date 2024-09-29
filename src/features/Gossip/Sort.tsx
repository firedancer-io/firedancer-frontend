import { DropdownMenu, Button } from "@radix-ui/themes";
import { useAtom } from "jotai";
import { gossipSortAtom } from "./atoms";
import { SortOptions } from "./types";
import { startTransition } from "react";

export default function Sort() {
  const [sort, setSort] = useAtom(gossipSortAtom);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button variant="soft">
          {sort}
          <DropdownMenu.TriggerIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {Object.values(SortOptions).map((value) => {
          return (
            <DropdownMenu.Item
              key={value}
              onClick={() =>
                startTransition(() => setSort(value as SortOptions))
              }
            >
              {value}
            </DropdownMenu.Item>
          );
        })}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
