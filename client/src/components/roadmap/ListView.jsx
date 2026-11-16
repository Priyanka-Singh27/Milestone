import React from "react";
import { Anchor, Coffee, Dumbbell, Swords } from "lucide-react";
import { Frame, ProgressBar } from "../ui";
import TaskRow from "./TaskRow";
import { PracticePlanCard } from "./Panels";
import { describeDay, formatDate, isDone, weekIndexOf, weekRange } from "../../lib/roadmap";

/**
 * Plain, keyboard- and screen-reader-friendly list of every day grouped by
 * calendar week. Past days stay visible so unfinished tasks can still be ticked.
 */
export default function ListView({ days, today, topicMap, trackFilter, busyKey, onSetStatus }) {
  const weeks = [...new Set(days.map((d) => weekIndexOf(days, d)))];
  const firstPractice = days.find((d) => d.phase === "practice");

  return (
    <div className="list-view">
      {weeks.map((w) => {
        const { days: wd, first, last } = weekRange(days, w);
        const tasks = wd.filter((d) => !d.isBufferDay).flatMap((d) => d.tasks || []);
        const done = tasks.filter((t) => isDone(t.status)).length;

        return (
          <Frame as="section" className="week-card" key={w} aria-labelledby={`week-${w}`}>
            <header className="week-head">
              <h3 id={`week-${w}`}>Week {w + 1}</h3>
              <span className="muted">{formatDate(first, { day: "numeric", month: "short" })} – {formatDate(last, { day: "numeric", month: "short" })}</span>
              {tasks.length > 0 && <ProgressBar value={done} max={tasks.length} label={`${done}/${tasks.length} tasks`} showText />}
            </header>

            {wd.map((day) => {
              const info = describeDay(day, today, topicMap);
              const shown = (day.tasks || []).filter((t) => trackFilter === "all" || t.track === trackFilter);
              return (
                <React.Fragment key={day.dayNumber}>
                  {firstPractice && day.dayNumber === firstPractice.dayNumber && (
                    <div className="phase-divider" role="separator">
                      <Swords size={16} aria-hidden="true" /> Practice phase begins
                    </div>
                  )}
                  <article className={`day-row day-${info.state} ${day.date === today ? "day-today" : ""}`} aria-label={`Day ${day.dayNumber}`}>
                    <div className="day-row-head">
                      <strong>Day {day.dayNumber}</strong>
                      <span className="muted">{formatDate(day.date)}</span>
                      {day.date === today && <span className="pill pill-core">Today</span>}
                      {info.state === "missed" && <span className="pill pill-warn"><Anchor size={11} aria-hidden="true" /> Missed</span>}
                      {info.kind === "rest" && <span className="pill pill-plain"><Coffee size={11} aria-hidden="true" /> Catch-up day</span>}
                      {info.kind === "practice" && <span className="pill pill-gold"><Dumbbell size={11} aria-hidden="true" /> Practice</span>}
                    </div>
                    {info.kind === "practice" && <PracticePlanCard plan={day.practicePlan} />}
                    {shown.map((t) => {
                      const k = `${day.dayNumber}::${t.id}`;
                      return <TaskRow key={k} day={day} task={t} topicName={topicMap.get(t.topicId)?.name} busy={busyKey === k} onSetStatus={onSetStatus} compact />;
                    })}
                    {info.kind === "rest" && <p className="muted">No new tasks. Use today to catch up.</p>}
                  </article>
                </React.Fragment>
              );
            })}
          </Frame>
        );
      })}
    </div>
  );
}
