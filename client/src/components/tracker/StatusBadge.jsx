import React from "react";
import { DEFAULT_APPLICATION_STATUSES } from "../../config/constants";

const CLASS = { Applied: "applied", OA: "oa", Interview: "interview", Offer: "offer", Rejected: "rejected" };

/** The five defaults get their own colour; any custom status shares one neutral style. */
export default function StatusBadge({ status }) {
  const known = DEFAULT_APPLICATION_STATUSES.includes(status);
  return <span className={`status status-${known ? CLASS[status] : "custom"}`}>{status}</span>;
}
