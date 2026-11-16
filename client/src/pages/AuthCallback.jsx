import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loading } from "../components/ui";

// We scrub the token from the address bar as soon as we read it. React
// StrictMode (development) runs effects twice, so the value read on the first
// run is kept here for the second run, then forgotten.
let tokenFromUrl = "";

/** Google redirects here as /auth/callback#token=… — read it, store it, scrub the URL. */
export default function AuthCallback() {
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
    if (fromHash) {
      tokenFromUrl = fromHash;
      // Remove the token from the address bar and the history entry right away.
      window.history.replaceState(null, "", window.location.pathname);
      setTimeout(() => { tokenFromUrl = ""; }, 3000);
    }

    if (tokenFromUrl) {
      login(tokenFromUrl);
      navigate("/continue", { replace: true });
    } else {
      navigate("/login?error=GOOGLE_FAILED", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <Loading who="pearl" title="Signing you in with Google…" />
    </div>
  );
}
