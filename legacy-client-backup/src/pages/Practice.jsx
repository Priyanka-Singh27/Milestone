import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ScrollText } from "lucide-react";
import { getFundamentals, listCertificates, updateFundamental } from "../api";
import { useAuth } from "../context/Auth";
import { Frame, Loading, Notice, PageHead } from "../components/ui";

const STATUS = [
  { id: "not_started", label: "Not started" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
];

export default function Practice() {
  const { userId } = useAuth();
  const [areas, setAreas] = useState(null);
  const [passed, setPassed] = useState(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId) return;
    Promise.allSettled([getFundamentals(), listCertificates(userId)]).then(([f, c]) => {
      if (f.status === "fulfilled") setAreas(f.value?.areas || []);
      else setError(f.reason?.message || "Could not load the fundamentals.");
      if (c.status === "fulfilled") {
        const s = new Set();
        (c.value?.certificates || []).filter((x) => x.type === "badge")
          .forEach((b) => (b.tags || []).forEach((t) => s.add(t)));
        setPassed(s);
      }
    });
  }, [userId]);

  async function setStatus(areaIdx, topicIdx, topicId, status) {
    const prev = areas;
    setAreas((a) =>
      a.map((area, ai) =>
        ai !== areaIdx
          ? area
          : { ...area, progress: area.progress.map((p, ti) => (ti === topicIdx ? { ...p, status } : p)) }
      )
    );
    try {
      await updateFundamental(topicId, status);
    } catch (e) {
      setAreas(prev);
      setError(e.message);
    }
  }

  if (!areas && !error) return <Loading who="finn" title="Sharpening the practice board…" />;

  const total = (areas || []).reduce((s, a) => s + a.topics.length, 0);
  const done = (areas || []).reduce(
    (s, a) => s + a.progress.filter((p) => ["completed", "verified"].includes(p.status)).length, 0
  );

  return (
    <>
      <PageHead
        kicker="CS FUNDAMENTALS"
        title="Practice,"
        em="bite by bite."
        text={`${done} of ${total} topics completed. Finish a topic to unlock its quiz.`}
        who="finn"
      />
      {error && <Notice>{error}</Notice>}

      <div className="area-grid">
        {(areas || []).map((area, ai) => (
          <Frame className="card area" key={area.area}>
            <div className="card-head">
              <h2>{area.area}</h2>
              <span className="muted">
                {area.progress.filter((p) => ["completed", "verified"].includes(p.status)).length}/{area.topics.length}
              </span>
            </div>

            <ul className="topic-list">
              {area.topics.map((t, ti) => {
                const status = area.progress[ti]?.status || "not_started";
                const complete = ["completed", "verified"].includes(status);
                return (
                  <li key={t.id} className={complete ? "topic-done" : ""}>
                    <div className="topic-main">
                      <strong>{t.name}</strong>
                      <small>{t.description}</small>
                      <small className="muted">{(t.outline || []).length} lessons</small>
                    </div>
                    <div className="topic-side">
                      <select value={status === "verified" ? "completed" : status}
                        onChange={(e) => setStatus(ai, ti, t.id, e.target.value)} aria-label={`Status of ${t.name}`}>
                        {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      {complete && t.quizEligible !== false && (
                        passed.has(t.id) ? (
                          <span className="pill pill-gold"><Check size={12} /> Passed</span>
                        ) : (
                          <Link to={`/quiz/${encodeURIComponent(t.id)}?src=fundamentals`} className="btn btn-gold btn-sm">
                            <ScrollText size={14} /> Quiz <ArrowRight size={13} />
                          </Link>
                        )
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Frame>
        ))}
      </div>
    </>
  );
}