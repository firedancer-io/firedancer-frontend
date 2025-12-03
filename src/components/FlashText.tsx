import { useState, useEffect } from "react";
import { Text, type TextProps } from "@radix-ui/themes";
import clsx from "clsx";
import styles from "./flashText.module.css";

interface FlashTextProps {
  value: string | number;
}

export default function FlashText({ value }: FlashTextProps & TextProps) {
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    setFlashing(false);
    const raf = requestAnimationFrame(() => {
      setFlashing(true);
      const timer = setTimeout(() => setFlashing(false), 200); // match css duration
      return () => clearTimeout(timer);
    });
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <Text className={clsx({ [styles.flash]: flashing })}>{value}</Text>;
}
