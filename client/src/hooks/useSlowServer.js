import { useEffect, useState } from "react";
import { slowStore } from "../api/slow";

/** true while any request has been running for more than a few seconds. */
export function useSlowServer() {
  const [slow, setSlow] = useState(slowStore.get());
  useEffect(() => slowStore.subscribe(setSlow), []);
  return slow;
}
