import { Button, Text } from "@radix-ui/themes";
import useNavigateLeaderSlot from "../../hooks/useNavigateLeaderSlot";
import chevronRight from "../../assets/chevron_right_18dp_F7F7F7_FILL1_wght400_GRAD0_opsz20.svg";
// import lastPage from "../../assets/last_page_18dp_F7F7F7_FILL1_wght400_GRAD0_opsz20.svg";
import styles from "./epochBar.module.css";

export default function NavigateNext() {
  const { navNextLeaderSlot } = useNavigateLeaderSlot();

  return (
    <>
      <Button
        size="1"
        className={styles.epochBtn}
        onClick={() => navNextLeaderSlot()}
      >
        <Text style={{ marginLeft: "8px" }}>1</Text>
        <img src={chevronRight} alt="last leader slot" />
      </Button>
      {/* <Button size="1" className={styles.epochBtn}>
        <img src={lastPage} alt="last epoch" />
      </Button> */}
    </>
  );
}
