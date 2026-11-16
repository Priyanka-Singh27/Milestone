import React, { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Award, Brain, Briefcase, Map as MapIcon, RefreshCw } from "lucide-react";
import { dashboardApi } from "../api";
import { useAuth } from "../context/AuthContext";
import { useRoadmap } from "../context/RoadmapContext";
import { useApi } from "../hooks/useApi";
import { friendlyError } from "../config/errors";
import { DEFAULT_APPLICATION_STATUSES } from "../config/constants";
import { Mascot } from "../components/art/Mascots";
import { Cloud, Flowers, Mountain, Ornament, Pine, Px, Shape, Tree, Windmill } from "../components/art/Scenery";
import { CardSkeleton, ErrorBanner, Frame, ProgressBar, ProgressRing } from "../components/ui";
import { formatLongDate, isDone, todayString } from "../lib/roadmap";

/** One dashboard card with its own loading / unavailable / empty handling. */
function StatCard({ icon: Icon, title, to, loading, unavailable, onRetry, empty, children }) {
  if (loading) return <CardSkeleton lines={2} />;
  return (
    <Frame className="card stat-card">
      <div className="card-head">
        <h2><Icon size={18} aria-hidden="true" /> {title}</h2>
        {!unavailable && !empty && <Link to={to} className="link-arrow">Open <ArrowRight size={14} aria-hidden="true" /></Link>}
      </div>
      {unavailable ? (
        <div className="card-unavailable">
          <p className="muted">We couldn't load this right now.</p>
          <button className="btn btn-sm btn-cream" onClick={onRetry}><RefreshCw size={14} aria-hidden="true" /> Retry</button>
        </div>
      ) : empty ? (
        <div className="card-empty">
          <p className="muted">{empty.text}</p>
          {empty.to && <Link className="btn btn-sm btn-gold" to={empty.to}>{empty.action}</Link>}
        </div>
      ) : (
        children
      )}
    </Frame>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const rm = useRoadmap();
  const { data, error, loading, retry } = useApi(() => dashboardApi.get(), []);

  // The roadmap itself (for the "today" strip and to tell "no roadmap" from "no tasks").
  useEffect(() => { rm.load(); /* eslint-disable-next-line */ }, []);

  const un = data?.unavailable || {};
  const name = (user?.name || "Explorer").split(" ")[0];
  const today = todayString();
  const todayDay = rm.roadmap?.days?.find((d) => d.date === today);
  const todayTasks = (todayDay?.tasks || []);
  const todayDone = todayTasks.filter((t) => isDone(t.status)).length;

  // A brand-new student with no roadmap belongs in onboarding, not on four empty cards.
  if (rm.status === "none") return <Navigate to="/onboarding/role" replace />;

  return (
    <>
      <section className="hero">
        <Px p={0.34} className="hero-layer hero-sky" />
        <Px p={0.28} className="hero-layer hero-clouds">
          <div style={{ left: "50%", top: "10%", width: 150 }}><Cloud /></div>
          <div style={{ left: "64%", top: "6%", width: 210 }}><Cloud /></div>
          <div style={{ left: "82%", top: "30%", width: 140 }}><Cloud /></div>
        </Px>
        <Px p={0.2} className="hero-layer hero-far">
          <div style={{ right: "26%", bottom: 96, width: 240 }}><Mountain /></div>
          <div style={{ right: "4%", bottom: 90, width: 180, opacity: 0.85 }}><Mountain /></div>
        </Px>
        <Px p={0.1} className="hero-layer hero-mid">
          <div style={{ right: "36%", bottom: 54, width: 100 }}><Windmill /></div>
          <div style={{ right: "26%", bottom: 50, width: 64 }}><Pine /></div>
          <div style={{ right: "7%", bottom: 50, width: 70 }}><Tree /></div>
        </Px>
        <svg className="hero-hill" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
          <Shape d="M0 60 Q260 10 520 52 T1200 36 V120 H0Z" tone="hill-2" />
          <Shape d="M0 90 Q300 50 600 84 T1200 70 V120 H0Z" tone="hill-3" />
        </svg>
        <div className="hero-flowers" aria-hidden="true"><Flowers /></div>
        <div className="hero-mascot" aria-hidden="true"><Mascot who="poppy" size={124} /></div>

        <div className="hero-text">
          <Ornament />
          <h1>Welcome back,<br /><em>{name}</em></h1>
          <p>
            {todayTasks.length
              ? `Today you have ${todayTasks.length} task${todayTasks.length === 1 ? "" : "s"}${todayDone ? `, ${todayDone} done already` : ""}.`
              : "Your journey continues here, one day at a time."}
          </p>
          <Link to="/roadmap" className="btn btn-cream">
            Continue where you left off <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      {error && <ErrorBanner message={friendlyError(error)} onRetry={retry} />}

      <div className="stat-grid">
        <StatCard icon={MapIcon} title="Roadmap" to="/roadmap" loading={loading} unavailable={un.roadmap} onRetry={retry}
          empty={!data?.roadmap && rm.status === "ready"
            ? { text: "Your roadmap has no tasks yet. You're heading straight into the practice phase.", to: "/roadmap", action: "Open roadmap" }
            : !data?.roadmap ? { text: "We're checking your roadmap…" } : null}>
          {data?.roadmap && (
            <div className="stat-body">
              <ProgressRing value={data.roadmap.progressPercent} size={92} stroke={10} label={`${data.roadmap.progressPercent} percent of the roadmap done`} />
              <div>
                <strong className="stat-big">{data.roadmap.completedTasks}<small> / {data.roadmap.totalTasks}</small></strong>
                <span className="muted">tasks done</span>
                {data.roadmap.phase && <span className="pill pill-core">{data.roadmap.phase === "practice" ? "Practice phase" : "Foundations phase"}</span>}
              </div>
            </div>
          )}
        </StatCard>

        <StatCard icon={Brain} title="Fundamentals" to="/fundamentals" loading={loading} unavailable={un.fundamentals} onRetry={retry}
          empty={!data?.fundamentals ? { text: "No fundamentals topics are available yet." } : null}>
          {data?.fundamentals && (
            <div className="stat-body col">
              <strong className="stat-big">{data.fundamentals.completed}<small> / {data.fundamentals.total}</small></strong>
              <span className="muted">topics completed</span>
              <ProgressBar value={data.fundamentals.completed} max={data.fundamentals.total} label={`${data.fundamentals.completed} of ${data.fundamentals.total} fundamentals topics done`} />
            </div>
          )}
        </StatCard>

        <StatCard icon={Briefcase} title="Applications" to="/applications" loading={loading} unavailable={un.applications} onRetry={retry}
          empty={!data?.applications ? { text: "You haven't tracked any applications yet.", to: "/applications", action: "Add your first" } : null}>
          {data?.applications && (
            <div className="stat-body col">
              <strong className="stat-big">{data.applications.total}<small> tracked</small></strong>
              <div className="chips">
                {Object.entries(data.applications.byStatus || {}).sort(([a], [b]) => {
                  const ia = DEFAULT_APPLICATION_STATUSES.indexOf(a); const ib = DEFAULT_APPLICATION_STATUSES.indexOf(b);
                  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                }).map(([status, n]) => <span key={status} className="chip">{status} · {n}</span>)}
              </div>
            </div>
          )}
        </StatCard>

        <StatCard icon={Award} title="Certificates" to="/vault" loading={loading} unavailable={un.certificates} onRetry={retry}
          empty={!data?.certificates ? { text: "Pass a topic quiz to earn your first badge, or upload a certificate.", to: "/vault", action: "Open vault" } : null}>
          {data?.certificates && (
            <div className="stat-body col">
              <strong className="stat-big">{data.certificates.total}<small> total</small></strong>
              <div className="chips">
                <span className="chip">{data.certificates.badges} badge{data.certificates.badges === 1 ? "" : "s"}</span>
                <span className="chip">{data.certificates.uploaded} uploaded</span>
              </div>
            </div>
          )}
        </StatCard>
      </div>

      {todayDay && (
        <Frame className="card">
          <div className="card-head">
            <div><span className="kicker">TODAY · {formatLongDate(today)}</span><h2>Your day at a glance</h2></div>
            <Link to="/roadmap" className="btn btn-gold">Open today's tasks <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          {todayDay.isBufferDay ? <p className="muted">It's a catch-up day. Finish anything you missed.</p>
            : todayTasks.length === 0 ? <p className="muted">Practice day: open the roadmap for today's drills.</p>
            : <ProgressBar value={todayDone} max={todayTasks.length} label={`${todayDone} of ${todayTasks.length} tasks done today`} showText />}
        </Frame>
      )}
    </>
  );
}
