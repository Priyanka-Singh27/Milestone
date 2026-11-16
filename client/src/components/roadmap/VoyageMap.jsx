import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { Mascot } from "../art/Mascots";
import { Cloud, DECOR, Mountain, Ornament, Px } from "../art/Scenery";
import { NodeIcon, QuizIcon, quizAvailability } from "./Panels";
import { describeDay, formatDate, isDone, weekIndexOf, weekRange } from "../../lib/roadmap";

/* ---------- geometry ---------- */
const ROW = 140;
const PAD_TOP = 125;
const PAD_BOTTOM = 160;
const NODE = 58;
const CHAPTER_GAP = 72;

const BIOMES = [
  { id: "meadow", name: "Sunny Meadow", decor: ["Windmill", "Tree", "Flowers", "Tree"] },
  { id: "lake", name: "Whispering Lake", decor: ["Lighthouse", "Boat", "Rocks", "Boat"] },
  { id: "highland", name: "Misty Highlands", decor: ["Mountain", "Pine", "Tent", "Pine"] },
];
const DECOR_W = { Windmill: 86, Tree: 64, Flowers: 78, Lighthouse: 58, Boat: 84, Rocks: 70, Mountain: 112, Pine: 54, Tent: 76 };
// far things lag behind the scroll, foreground things rush past it
const DECOR_SPEED = { Mountain: 0.22, Windmill: 0.12, Lighthouse: 0.12, Tree: 0.08, Pine: 0.08, Tent: 0.06, Boat: 0.06, Flowers: -0.08, Rocks: -0.08 };

function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

export default function VoyageMap({ days, stops, topicMap, today, role, selectedKey, onSelect }) {
  const [mapRef, mapWidth] = useElementWidth();
  const [mapTop, setMapTop] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const currentRef = useRef(null);
  const didScroll = useRef(false);

  const currentDayIndex = useMemo(() => {
    const i = days.findIndex((d) => d.date >= today);
    return i === -1 ? days.length - 1 : i;
  }, [days, today]);

  const weekOfStop = (s) => weekIndexOf(days, days[s.dayIndex]);
  const currentWeek = weekIndexOf(days, days[currentDayIndex] || days[0]);
  const firstWeek = showAll ? 0 : Math.max(0, currentWeek - 1);
  const lastWeek = currentWeek + 1;

  const visible = stops.filter((s) => weekOfStop(s) >= firstWeek && weekOfStop(s) <= lastWeek);
  const hiddenBefore = days.filter((d) => weekIndexOf(days, d) < firstWeek).length;
  const hiddenAfter = days.filter((d) => weekIndexOf(days, d) > lastWeek).length;
  const firstPracticeDay = days.find((d) => d.phase === "practice");

  /* ----- geometry ----- */
  const width = mapWidth || 360;
  const narrow = width < 480;
  const xs = narrow ? [0.17, 0.83] : [0.27, 0.73];
  const gap = narrow ? 14 : 22;
  const labelW = narrow
    ? Math.min(200, width * (1 - xs[0]) - NODE / 2 - gap - 12)
    : Math.max(118, Math.min(230, width * 0.5 - NODE / 2 - 30));

  const weekOrder = [...new Set(visible.map(weekOfStop))];

  const nodes = visible.map((s, i) => ({
    ...s,
    key: s.type === "day" ? `day-${s.day.dayNumber}` : `quiz-${s.topic.id}`,
    week: weekOfStop(s),
    biome: BIOMES[weekOfStop(s) % BIOMES.length],
    info: s.type === "day" ? describeDay(s.day, today, topicMap) : null,
    avail: s.type === "quiz" ? quizAvailability(s) : null,
    x: width * xs[i % 2],
    y: PAD_TOP + i * ROW + weekOrder.indexOf(weekOfStop(s)) * CHAPTER_GAP,
  }));

  const dest = {
    x: width * xs[nodes.length % 2],
    y: PAD_TOP + nodes.length * ROW + Math.max(0, weekOrder.length - 1) * CHAPTER_GAP,
  };
  const points = [...nodes, dest];
  const mapHeight = dest.y + PAD_BOTTOM;

  const segments = points.slice(0, -1).map((p, i) => {
    const q = points[i + 1];
    const mid = (p.y + q.y) / 2;
    const n = nodes[i];
    return {
      key: i,
      d: `M ${p.x} ${p.y} C ${p.x} ${mid}, ${q.x} ${mid}, ${q.x} ${q.y}`,
      done: n.type === "day" ? n.info.state === "done" || n.info.state === "passed" : n.avail.kind === "passed",
    };
  });

  const bands = weekOrder.map((w, k) => {
    const first = nodes.find((n) => n.week === w);
    const next = nodes.find((n) => n.week === weekOrder[k + 1]);
    const top = k === 0 ? 0 : first.y - 135;
    const bottom = next ? next.y - 135 + 100 : mapHeight;
    return { w, top, height: bottom - top, biome: first.biome, first: k === 0 };
  });

  /* ----- scenery with depth ----- */
  const scenery = [];
  nodes.forEach((n, i) => {
    const name = n.biome.decor[i % n.biome.decor.length];
    const w = DECOR_W[name] * Math.min(1, Math.max(0.72, width / 560));
    const sx = Math.min(width - w / 2 - 6, Math.max(w / 2 + 6, width * (i % 2 === 0 ? 0.91 : 0.09)));
    scenery.push({ key: `d${i}`, Art: DECOR[name], x: sx, y: n.y + ROW / 2 + 8, w, p: DECOR_SPEED[name], z: 1 });
  });
  bands.forEach((b) => {
    scenery.push({ key: `c1${b.w}`, Art: Cloud, x: width * 0.16, y: b.top + 90, w: 150, p: 0.2, z: 0, soft: true });
    scenery.push({ key: `c2${b.w}`, Art: Cloud, x: width * 0.86, y: b.top + 300, w: 120, p: 0.14, z: 0, soft: true });
    if (b.biome.id !== "lake") scenery.push({ key: `m${b.w}`, Art: Mountain, x: width * 0.55, y: b.top + 150, w: 210, p: 0.26, z: 0, soft: true });
  });

  // each layer sits still when it is centred in the viewport
  useLayoutEffect(() => {
    const el = mapRef.current;
    if (el) setMapTop(el.getBoundingClientRect().top + window.scrollY);
  }, [mapRef, mapWidth, mapHeight]);
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // bring "you are here" into view once
  useEffect(() => {
    if (didScroll.current || !currentRef.current || !mapWidth) return;
    didScroll.current = true;
    currentRef.current.scrollIntoView({ block: "center" });
  }, [mapWidth, nodes.length]);

  const weekStarts = new Set(weekOrder.map((w) => nodes.find((n) => n.week === w)?.key));

  return (
    <div className="vy-sea">
      {hiddenBefore > 0 && (
        <button className="vy-more" onClick={() => setShowAll(true)}>
          Show {hiddenBefore} earlier day{hiddenBefore === 1 ? "" : "s"}
        </button>
      )}

      <div className="vy-map" ref={mapRef} style={{ height: mapHeight }}>
        {bands.map((b) => (
          <div key={b.w} className={`vy-band vy-band-${b.biome.id} ${b.first ? "vy-band-first" : ""}`} style={{ top: b.top, height: b.height }} />
        ))}

        {scenery.map((s) => (
          <Px key={s.key} p={s.p} top={mapTop + s.y - vh / 2}
            className={`vy-decor ${s.soft ? "vy-decor-soft" : ""}`}
            style={{ left: s.x, top: s.y, width: s.w, zIndex: s.z }}>
            <s.Art />
          </Px>
        ))}

        <svg className="vy-road" width={width} height={mapHeight} viewBox={`0 0 ${width} ${mapHeight}`} aria-hidden="true">
          {segments.map((s) => <path key={`e${s.key}`} d={s.d} className="vy-road-edge" />)}
          {segments.map((s) => <path key={`b${s.key}`} d={s.d} className="vy-road-base" />)}
          {segments.map((s) => s.done && <path key={`d${s.key}`} d={s.d} className="vy-road-done" />)}
          {segments.map((s) => <path key={`l${s.key}`} d={s.d} className="vy-road-line" />)}
        </svg>

        {nodes.map((n) => {
          const isQuiz = n.type === "quiz";
          const isCurrent = !isQuiz && n.dayIndex === currentDayIndex;
          const right = n.x < width / 2;
          const state = isQuiz ? n.avail.kind : n.info.state;
          const kind = isQuiz ? "quiz" : n.info.kind;

          return (
            <React.Fragment key={n.key}>
              {weekStarts.has(n.key) && (
                <WeekBanner week={n.week} biome={n.biome} days={days} y={n.y - 116}
                  phaseStart={firstPracticeDay && weekIndexOf(days, firstPracticeDay) === n.week} />
              )}

              <button
                ref={isCurrent ? currentRef : null}
                className={`vy-node vy-${kind} vy-${state} ${selectedKey === n.key ? "vy-selected" : ""}`}
                style={{ left: n.x, top: n.y }}
                onClick={() => onSelect(n.key)}
                aria-label={isQuiz ? `Quiz gate for ${n.topic.name}: ${n.avail.short.toLowerCase()}` : `Day ${n.day.dayNumber}, ${n.info.title}, ${n.info.state}`}
              >
                {isQuiz ? <QuizIcon kind={n.avail.kind} /> : <NodeIcon info={n.info} />}
                {isCurrent && <span className="vy-pip" aria-hidden="true"><Mascot who="poppy" size={64} /></span>}
              </button>

              <button
                className={`vy-label ${right ? "vy-label-right" : "vy-label-left"} vy-label-${isQuiz ? `quiz-${n.avail.kind}` : state}`}
                style={{ top: n.y, width: labelW, ...(right ? { left: n.x + NODE / 2 + gap } : { left: n.x - NODE / 2 - gap - labelW }) }}
                onClick={() => onSelect(n.key)}
                tabIndex={-1}
                aria-hidden="true"
              >
                {isQuiz ? (
                  <>
                    <span className="vy-kicker">TOPIC QUIZ<b className={n.avail.kind === "passed" ? "b-gold" : ""}>{n.avail.short}</b></span>
                    <strong>{n.topic.name}</strong>
                    <small>{n.progress.doneLessons}/{n.progress.total} lessons</small>
                  </>
                ) : (
                  <>
                    <span className="vy-kicker">
                      DAY {n.day.dayNumber}
                      {isCurrent && <b>TODAY</b>}
                      {n.info.state === "missed" && <b className="b-warn">MISSED</b>}
                      {n.info.kind === "practice" && <b className="b-gold">PRACTICE</b>}
                    </span>
                    <strong>{n.info.title}</strong>
                    <small>{n.info.kind === "study" ? `${n.info.done}/${n.info.total} done · ` : ""}{formatDate(n.day.date)}</small>
                  </>
                )}
              </button>
            </React.Fragment>
          );
        })}

        <div className="vy-destination" style={{ left: dest.x, top: dest.y }}>
          <div className="vy-dest-mountain" aria-hidden="true"><Mountain /></div>
          <div className="vy-node vy-dest-node"><Flag size={24} aria-hidden="true" /></div>
          <div className="vy-dest-text">
            <strong>{role?.name || "Your destination"}</strong>
            <small>
              {hiddenAfter > 0
                ? `${hiddenAfter} more day${hiddenAfter === 1 ? "" : "s"} appear as you sail`
                : "More days are added as you progress"}
            </small>
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekBanner({ week, biome, days, y, phaseStart }) {
  const { first, last, days: wd } = weekRange(days, week);
  const tasks = wd.filter((d) => !d.isBufferDay).flatMap((d) => d.tasks || []);
  const done = tasks.filter((t) => isDone(t.status)).length;
  const complete = tasks.length > 0 && done === tasks.length;
  return (
    <div className={`vy-chapter ${complete ? "vy-chapter-done" : ""}`} style={{ top: y }}>
      <Ornament>{complete ? "★" : "✦"}</Ornament>
      <strong>{biome.name}</strong>
      <small>WEEK {week + 1} · {formatDate(first, { day: "numeric", month: "short" })} – {formatDate(last, { day: "numeric", month: "short" })}{tasks.length ? ` · ${done}/${tasks.length}` : ""}</small>
      {phaseStart && <small className="vy-phase">⚔ Practice phase begins</small>}
    </div>
  );
}
