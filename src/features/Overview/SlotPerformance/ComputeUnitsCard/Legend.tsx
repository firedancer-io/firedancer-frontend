import styles from "./computeUnits.module.css";
import { Text } from "@radix-ui/themes";

export default function Legend() {
  return (
    <div className={styles.legend}>
      <Text className={styles.title}>Banks required</Text>
      <div className={styles.grid}>
        <svg width="65px" height="15px">
          <line
            stroke="#1E9C50"
            strokeDasharray="3 3"
            strokeWidth="1"
            x1="2"
            y1="7"
            x2="65"
            y2="7"
          />
        </svg>
        <Text>1</Text>
        <svg width="65px" height="15px">
          <line
            stroke="#AE5511"
            strokeDasharray="3 3"
            strokeWidth="1"
            x1="2"
            y1="7"
            x2="65"
            y2="7"
          />
        </svg>
        <Text>2</Text>
        <svg width="65px" height="15px">
          <line
            stroke="#CF321D"
            strokeDasharray="3 3"
            strokeWidth="1"
            x1="2"
            y1="7"
            x2="65"
            y2="7"
          />
        </svg>
        <Text>3</Text>
        <svg width="65px" height="15px">
          <line
            stroke="#F40505"
            strokeDasharray="3 3"
            strokeWidth="1"
            x1="2"
            y1="7"
            x2="65"
            y2="7"
          />
        </svg>
        <Text>4</Text>
      </div>
    </div>
  );
}
