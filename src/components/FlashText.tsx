import { useState, useEffect } from "react";
import { Text, type TextProps } from "@radix-ui/themes";
import clsx from "clsx";
import styles from "./flashText.module.css";

interface FlashTextProps {
  value: string | number;
}

export default function FlashText({
  value,
  ...props
}: FlashTextProps & TextProps) {
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    setFlashing(false);
    const raf = requestAnimationFrame(() => {
      setFlashing(true);
      timer = setTimeout(() => setFlashing(false), 200); // match css duration
    });
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <Text
      {...props}
      className={clsx(styles.flashText, { [styles.flash]: flashing })}
    >
      {value}
    </Text>
  );
}
