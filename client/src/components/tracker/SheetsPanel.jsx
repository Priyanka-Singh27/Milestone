import React, { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, RefreshCw, Table2 } from "lucide-react";
import { applicationsApi } from "../../api";
import { friendlyError } from "../../config/errors";
import { Notice, Skeleton } from "../ui";

// Only ever send the student to a real Google Sheets link.
const safeSheetUrl = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "docs.google.com" ? u.href : null;
  } catch { return null; }
};

export default function SheetsPanel({ disabled }) {
  const [state, setState] = useState({ loading: true, connected: false, configured: true });
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(null);
  const [message, setMessage] = useState(null); // { tone, text }

  useEffect(() => {
    let alive = true;
    applicationsApi.sheetsStatus()
      .then((d) => alive && setState({ loading: false, connected: Boolean(d.connected), configured: d.configured !== false }))
      .catch(() => alive && setState({ loading: false, connected: false, configured: true, failed: true }));
    return () => { alive = false; };
  }, []);

  // The consent link expires after 10 minutes, so it is requested only on click.
  async function connect() {
    setConnecting(true);
    setMessage(null);
    try {
      const { authUrl } = await applicationsApi.sheetsConnect();
      if (!authUrl) throw new Error("no url");
      window.location.assign(authUrl);
    } catch (err) {
      setConnecting(false);
      if (err.code === "SHEETS_NOT_CONFIGURED") setState((s) => ({ ...s, configured: false }));
      else setMessage({ tone: "error", text: friendlyError(err) });
    }
  }

  async function sync() {
    setSyncing(true);
    setMessage(null);
    setSheetUrl(null);
    try {
      const data = await applicationsApi.sheetsSync();
      const url = safeSheetUrl(data.sheetUrl);
      setSheetUrl(url);
      setMessage({ tone: "success", text: "Your applications are now in Google Sheets." });
    } catch (err) {
      if (err.code === "SHEETS_AUTH_EXPIRED" || err.code === "SHEETS_NOT_CONNECTED") {
        setState((s) => ({ ...s, connected: false }));
      } else if (err.code === "SHEETS_NOT_CONFIGURED") {
        setState((s) => ({ ...s, configured: false }));
      }
      setMessage({ tone: "error", text: friendlyError(err) });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <aside className="sheets" aria-label="Google Sheets sync">
      <div className="sheets-head"><Table2 size={18} aria-hidden="true" /> <strong>Google Sheets</strong></div>

      {state.loading ? (
        <Skeleton h={36} w={180} />
      ) : !state.configured ? (
        <p className="muted">Sheets sync isn't available right now.</p>
      ) : state.connected ? (
        <>
          <p className="muted"><CheckCircle2 size={14} aria-hidden="true" /> Connected</p>
          <button className="btn btn-gold btn-sm" onClick={sync} disabled={syncing || disabled}>
            <RefreshCw size={14} className={syncing ? "spin" : ""} aria-hidden="true" /> {syncing ? "Syncing…" : "Sync to Google Sheets"}
          </button>
          {sheetUrl && (
            <a className="btn btn-cream btn-sm" href={sheetUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} aria-hidden="true" /> Open sheet
            </a>
          )}
        </>
      ) : (
        <>
          <p className="muted">Keep a live copy of your applications in a spreadsheet.</p>
          <button className="btn btn-gold btn-sm" onClick={connect} disabled={connecting}>
            {connecting ? "Opening Google…" : "Connect Google Sheets"}
          </button>
        </>
      )}

      {state.failed && <Notice tone="warn">We couldn't check your connection.</Notice>}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </aside>
  );
}
