import React from "react";
import { EmptyState } from "../components/ui";

export default function NotFound() {
  return (
    <div className="page">
      <EmptyState who="pearl" title="This page drifted away" text="We couldn't find what you were looking for." to="/" actionLabel="Back to safe waters" />
    </div>
  );
}
