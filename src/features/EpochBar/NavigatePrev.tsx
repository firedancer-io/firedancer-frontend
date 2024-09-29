import { Button, Text } from "@radix-ui/themes";
import useNavigateLeaderSlot from "../../hooks/useNavigateLeaderSlot";
import chevronLeft from "../../assets/chevron_left_18dp_F7F7F7_FILL1_wght400_GRAD0_opsz20.svg";
// import firstPage from "../../assets/first_page_18dp_F7F7F7_FILL1_wght400_GRAD0_opsz20.svg";
import styles from "./epochBar.module.css";

export default function NavigatePrev() {
  const { navPrevLeaderSlot } = useNavigateLeaderSlot();

  return (
    <>
      {/* <Button size="1" className={styles.epochBtn}>
        <img src={firstPage} alt="last epoch" />
      </Button> */}
      <Button
        size="1"
        className={styles.epochBtn}
        onClick={() => navPrevLeaderSlot()}
      >
        <img src={chevronLeft} alt="last leader slot" />
        <Text style={{ marginRight: "8px" }}>1</Text>
      </Button>
    </>
  );
}
