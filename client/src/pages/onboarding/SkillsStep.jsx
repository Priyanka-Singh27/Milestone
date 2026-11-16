import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { skillsApi } from "../../api";
import { useOnboarding } from "../../context/OnboardingContext";
import { useRoles } from "../../context/RolesContext";
import { useRoadmap } from "../../context/RoadmapContext";
import { useApi } from "../../hooks/useApi";
import { friendlyError } from "../../config/errors";
import {
  CONFIDENCE_TO_PROFICIENCY, PROFICIENCIES, RESUME_RULES, TRACKS,
} from "../../config/constants";
import { verifiedTopicsFromRoadmap } from "../../lib/roadmap";
import {
  FileDropzone, Frame, LockedNote, Notice, PriorityTag, ProgressOverlay, TrackBadge, VerifiedBadge,
} from "../../components/ui";

const CONFIDENCE_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };

export default function SkillsStep() {
  const navigate = useNavigate();
  const { getRole, idOf } = useRoles();
  const { roadmap } = useRoadmap();
  const { roleId, skills, setSkills, resetFromSkills } = useOnboarding();
  const role = getRole(roleId);
  const topics = role?.topics || [];

  const [file, setFile] = useState(null);
  const [reading, setReading] = useState(false);
  const [resumeError, setResumeError] = useState("");
  const [resumeInfo, setResumeInfo] = useState("");
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("all");
  const searchRef = useRef(null);

  // Topics already verified by a quiz are locked as known. Prefer the server list;
  // fall back to what the roadmap shows as verified.
  const { data: verifiedFromServer } = useApi(
    () => skillsApi.verified().then((d) => d.verifiedTopicIds || []).catch(() => null),
    []
  );
  const verified = useMemo(() => {
    const set = new Set(verifiedFromServer || []);
    verifiedTopicsFromRoadmap(roadmap, new Map(topics.map((t) => [t.id, t]))).forEach((id) => set.add(id));
    return set;
  }, [verifiedFromServer, roadmap, topics]);

  async function readResume() {
    if (!file || reading) return;
    setReading(true);
    setResumeError("");
    setResumeInfo("");
    try {
      const form = new FormData();
      form.append("resume", file);
      form.append("targetRoleId", roleId);
      const data = await skillsApi.extract(form);
      const found = data.skills || [];
      setSkills((prev) => {
        const next = { ...prev };
        found.forEach((s) => {
          if (!next[s.topicId]) {
            next[s.topicId] = {
              proficiency: CONFIDENCE_TO_PROFICIENCY[s.confidence] || "beginner",
              confidence: s.confidence,
              fromResume: true,
            };
          }
        });
        return next;
      });
      setResumeInfo(
        found.length
          ? `We found ${found.length} skill${found.length === 1 ? "" : "s"} in your resume and ticked them below. Please review and adjust.`
          : "We couldn't match any skills for this role in your resume. You can tick them yourself below."
      );
    } catch (err) {
      setResumeError(friendlyError(err));
    } finally {
      setReading(false);
    }
  }

  const toggle = (id, on) =>
    setSkills((prev) => {
      const next = { ...prev };
      if (on) next[id] = { proficiency: "beginner" };
      else delete next[id];
      return next;
    });
  const setLevel = (id, proficiency) => setSkills((prev) => ({ ...prev, [id]: { ...prev[id], proficiency } }));

  const trackList = useMemo(() => [...new Set(topics.map((t) => t.track))], [topics]);
  const visible = topics.filter(
    (t) =>
      (track === "all" || t.track === track) &&
      (!query.trim() || t.name.toLowerCase().includes(query.trim().toLowerCase()))
  );
  const grouped = trackList
    .map((tr) => [tr, visible.filter((t) => t.track === tr)])
    .filter(([, list]) => list.length > 0);

  const knownCount = topics.filter((t) => skills[t.id] || verified.has(t.id)).length;

  function manualEntry() {
    setResumeError("");
    searchRef.current?.focus();
    searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <Frame className="card step-card">
      <h2>What do you already know?</h2>
      <p className="muted">
        Upload your resume to pre-fill this list, or tick topics yourself. Nothing is saved yet, this only shapes your plan.
      </p>

      <div className="resume-box">
        <h3>Option 1 · Read my resume</h3>
        <FileDropzone
          file={file}
          onFile={(f) => { setFile(f); setResumeError(""); }}
          rules={RESUME_RULES}
          label="PDF or DOCX, up to 5 MB"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={reading}
        />
        <div className="row-gap">
          <button className="btn btn-gold" onClick={readResume} disabled={!file || reading}>
            {reading ? "Reading your resume…" : "Read my resume"}
          </button>
          <button className="btn btn-cream" onClick={manualEntry}>Enter skills manually</button>
        </div>
        {resumeInfo && <Notice tone="success">{resumeInfo}</Notice>}
        {resumeError && (
          <Notice action={<button className="btn btn-sm btn-cream" onClick={readResume} disabled={!file}>Try again</button>}>
            {resumeError}
          </Notice>
        )}
      </div>

      <h3>Option 2 · Tick what you know</h3>
      <div className="filters">
        <label className="search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search topics</span>
          <input ref={searchRef} type="search" placeholder="Search topics" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="chips" role="group" aria-label="Filter by track">
          <button className={`chip-filter ${track === "all" ? "on" : ""}`} onClick={() => setTrack("all")} aria-pressed={track === "all"}>All</button>
          {trackList.map((tr) => (
            <button key={tr} className={`chip-filter ${track === tr ? "on" : ""}`} onClick={() => setTrack(tr)} aria-pressed={track === tr}>
              {TRACKS[tr]?.label || tr}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 && <p className="muted">No topics match “{query}”.</p>}

      {grouped.map(([tr, list]) => (
        <fieldset className="skill-group" key={tr}>
          <legend><TrackBadge track={tr} /></legend>
          {list.map((t) => {
            const isVerified = verified.has(t.id);
            const entry = skills[t.id];
            const checked = Boolean(entry) || isVerified;
            return (
              <div key={t.id} className={`skill-row ${checked ? "skill-on" : ""}`}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isVerified}
                    onChange={(e) => toggle(t.id, e.target.checked)}
                  />
                  <span className="check-box" aria-hidden="true" />
                  <span className="skill-name">
                    {t.name}
                    <span className="sr-only"> — I know this</span>
                  </span>
                </label>
                <span className="skill-tags">
                  <PriorityTag priority={t.priority} />
                  {isVerified && <VerifiedBadge compact />}
                  {entry?.fromResume && <span className="pill pill-plain">{CONFIDENCE_LABEL[entry.confidence]}</span>}
                </span>
                {isVerified ? (
                  <LockedNote>Verified by quiz</LockedNote>
                ) : (
                  entry && (
                    <select
                      aria-label={`How well do you know ${t.name}?`}
                      value={entry.proficiency}
                      onChange={(e) => setLevel(t.id, e.target.value)}
                    >
                      {PROFICIENCIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  )
                )}
              </div>
            );
          })}
        </fieldset>
      ))}

      <p className="hint">
        <strong>{knownCount}</strong> topic{knownCount === 1 ? "" : "s"} marked as known. A topic only counts as known at
        <em> Intermediate</em> or <em>Advanced</em>. Beginner topics stay in your plan so you can learn them properly.
      </p>

      <div className="step-actions">
        <button className="btn btn-cream" onClick={() => navigate("/onboarding/role")}>
          <ArrowLeft size={16} aria-hidden="true" /> Back
        </button>
        <button
          className="btn btn-gold"
          onClick={() => { resetFromSkills(); navigate("/onboarding/gap"); }}
        >
          Next: review the gap <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>

      <ProgressOverlay
        open={reading}
        who="wren"
        title="Reading your resume…"
        messages={["Opening your file…", "Looking for skills that match this role…", "Almost done…"]}
      />
    </Frame>
  );
}
