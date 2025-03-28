import React from "react";
import styles from "./computeUnits.module.css";
import { Text } from "@radix-ui/themes";
import { clickedTransactionAtom } from "./atoms";
import { useAtomValue } from "jotai";

export default function TransactionMeta() {
  const clickedTransaction = useAtomValue(clickedTransactionAtom);

  return (
    <div className={styles.txnMeta}>
      {clickedTransaction.map((txn, i) => (
        <React.Fragment key={i}>
          <Text className={styles.title}>
            Transaction {txn.transactionIndex}
          </Text>
          <div className={styles.grid}>
            <Text style={{ textAlign: "left" }}>Bank:&nbsp;&nbsp;</Text>
            <Text style={{ textAlign: "right" }}>{txn.bankIndex}</Text>
            <Text style={{ textAlign: "left" }}>Est. CUs:&nbsp;&nbsp;</Text>
            <Text style={{ textAlign: "right" }}>
              {txn.computeUnitsEstimated}
            </Text>
            <Text style={{ textAlign: "left" }}>Reb. CUs:&nbsp;&nbsp;</Text>
            <Text style={{ textAlign: "right" }}>
              {txn.computeUnitsRebated}
            </Text>
            <Text style={{ textAlign: "left" }}>
              Prio Fee (LP):&nbsp;&nbsp;
            </Text>
            <Text style={{ textAlign: "right" }}>
              {txn.priorityFeeLamports.toLocaleString()}
            </Text>
            <Text style={{ textAlign: "left" }}>
              CU Price (LP):&nbsp;&nbsp;
            </Text>
            <Text style={{ textAlign: "right" }}>
              {txn.lamportsPerCu.toLocaleString()}
            </Text>
            <Text style={{ textAlign: "left" }}>Err Code:&nbsp;&nbsp;</Text>
            <Text style={{ textAlign: "right" }}>{txn.errorCode}</Text>
            <Text style={{ textAlign: "left" }}>Is Vote:&nbsp;&nbsp;</Text>
            <Text style={{ textAlign: "right" }}>
              {txn.isVote ? "true" : "false"}
            </Text>
            <Text style={{ textAlign: "left" }}>Bundle:&nbsp;&nbsp;</Text>
            <Text style={{ textAlign: "right" }}>
              {txn.fromBundle ? "true" : "false"}
            </Text>
            <Text style={{ textAlign: "left" }}>
              ExecTime (us):&nbsp;&nbsp;
            </Text>
            <Text style={{ textAlign: "right" }}>
              {txn.endExecTimestampNanos - txn.endLoadTimestampNanos}
            </Text>
            <Text style={{ textAlign: "left" }}>
              BatchTime (us):&nbsp;&nbsp;
            </Text>
            <Text style={{ textAlign: "right" }}>
              {txn.endTimestampNanos - txn.startTimestampNanos}
            </Text>
          </div>
          {i < clickedTransaction.length - 1 ? <br /> : <></>}
        </React.Fragment>
      ))}
    </div>
  );
}
