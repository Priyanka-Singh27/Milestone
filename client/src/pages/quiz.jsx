import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Clock, Medal, RefreshCw, ScrollText, X } from "lucide-react";
import { fundamentalsApi, quizApi } from "../api";
import { useAuth } from "../context/AuthContext";
import { useRoles } from "../context/RolesContext";
import { friendlyError } from "../config/errors";
import { QUIZ_FALLBACK } from "../config/constants";
import { formatDuration } from "../lib/roadmap";
import { Mascot } from "../components/art/Mascots";
import { ConfirmDialog, ErrorBanner, Frame, Loading, Notice } from "../components/ui";
import { Ornament } from "../components/art/Scenery";

const LETTERS = ["A", "B", "C", "D"];

/** Why a quiz can't be taken right now, in plain words. */
function blockedText(status) {
  switch (status.blockedReason) {
    case "TOPIC_NOT_COMPLETE": return "Finish every lesson of this topic first. The quiz opens as soon as they're all done.";
    case "COOLDOWN_ACTIVE": {
      const left = status.cooldownEndsAt ? formatDuration(new Date(status.cooldownEndsAt).getTime() - Date.now()) : "a little while";
      return `You can try again in ${left}. Use the time to review the topic. You have ${status.attemptsLeft} attempt${status.attemptsLeft === 1 ? "" : "s"} left.`;
    }
    case "MAX_ATTEMPTS_REACHED": return "You've used all your attempts for this quiz.";
    case "ALREADY_PASSED": return "You already passed this quiz and earned the badge. 🎉";
    case "TOPIC_NOT_FOUND": return "That topic isn't part of your roadmap or the fundamentals.";
    default: return "This quiz isn't available right now.";
  }
}

export default function Quiz() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles } = useRoles();

  const [phase, setPhase] = useState("checking"); // checking | blocked | intro | generating | playing | submitting | result | error
  const [status, setStatus] = useState(null);
  const [topicName, setTopicName] = useState("");
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [leaving, setLeaving] = useState(false);

  /* 1) Ask the server whether this quiz can be taken: complete? attempts? cooldown? */
  async function check() {
    setPhase("checking");
    setError(null);
    try {
      const data = await quizApi.status(topicId);
      const s = data.status || data;
      setStatus(s);
      let name = roles.flatMap((r) => r.topics || []).find((t) => t.id === topicId)?.name;
      if (!name && s.source === "fundamentals") {
        const f = await fundamentalsApi.get().catch(() => null);
        name = (f?.areas || []).flatMap((a) => a.topics).find((t) => t.id === topicId)?.name;
      }
      setTopicName(name || topicId);
      setPhase(s.canAttempt ? "intro" : "blocked");
    } catch (err) {
      setError(err);
      setPhase("error");
    }
  }
  useEffect(() => { check(); /* eslint-disable-next-line */ }, [topicId]);

  // Leaving mid-quiz loses the answers, so warn on refresh/close.
  useEffect(() => {
    if (phase !== "playing") return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  const back = status?.source === "fundamentals" ? "/fundamentals" : "/roadmap";

  /* 2) Generate (or fetch the cached) quiz */
  async function start() {
    setPhase("generating");
    setError(null);
    try {
      const data = await quizApi.generate(topicId, user?.targetRoleId);
      const q = data.quiz;
      if (!q?.questions?.length) throw Object.assign(new Error("empty"), { code: "QUIZ_GENERATION_FAILED" });
      setQuiz(q);
      setAnswers(Array(q.questions.length).fill(null));
      setIndex(0);
      setPhase("playing");
    } catch (err) {
      setError(err);
      setPhase(err.data?.status ? "blocked" : "intro");
      if (err.data?.status) setStatus(err.data.status);
    }
  }

  /* 3) Submit */
  async function submit() {
    setPhase("submitting");
    setError(null);
    try {
      const data = await quizApi.submit({ quizId: quiz._id || quiz.id, topicId, answers });
      setResult(data);
      setPhase("result");
    } catch (err) {
      setError(err);
      if (["COOLDOWN_ACTIVE", "MAX_ATTEMPTS_REACHED", "ALREADY_PASSED", "TOPIC_NOT_COMPLETE"].includes(err.code)) {
        await check();
      } else {
        setPhase("playing");
      }
    }
  }

  const answered = answers.filter((a) => a !== null).length;

  if (phase === "checking") return <Loading who="hazel" title="Checking the gate…" />;
  if (phase === "generating") return <Loading who="hazel" title="Brewing your questions…" text="This can take up to a minute the first time." />;
  if (phase === "submitting") return <Loading who="hazel" title="Grading your answers…" />;
  if (phase === "error") {
    return (
      <>
        <ErrorBanner message={friendlyError(error)} onRetry={check} />
        <Link to="/roadmap" className="btn btn-cream"><ArrowLeft size={16} aria-hidden="true" /> Back</Link>
      </>
    );
  }

  if (phase === "blocked") {
    return (
      <Frame className="state-card">
        <Mascot who="hazel" size={110} />
        <h1 className="h3">{status?.blockedReason === "ALREADY_PASSED" ? "Already passed!" : "Not just yet"}</h1>
        <p>{blockedText(status || {})}</p>
        {error && <Notice>{friendlyError(error)}</Notice>}
        <div className="row-gap">
          <Link to={back} className="btn btn-cream"><ArrowLeft size={16} aria-hidden="true" /> Back</Link>
          {status?.blockedReason === "ALREADY_PASSED" && <Link to="/vault" className="btn btn-gold"><Medal size={16} aria-hidden="true" /> See my badge</Link>}
        </div>
      </Frame>
    );
  }

  if (phase === "intro") {
    const max = status?.maxAttempts ?? QUIZ_FALLBACK.maxAttempts;
    return (
      <Frame className="quiz-intro">
        <Mascot who="hazel" size={130} />
        <Ornament />
        <span className="kicker">TOPIC QUIZ</span>
        <h1>{topicName}</h1>
        <ul className="rules">
          <li><ScrollText size={14} aria-hidden="true" /> {QUIZ_FALLBACK.questionRange} multiple-choice questions</li>
          <li><Check size={14} aria-hidden="true" /> {status?.passingScore ?? QUIZ_FALLBACK.passingScore}% or more to pass and earn a verified badge</li>
          <li><RefreshCw size={14} aria-hidden="true" /> Attempt {(status?.attemptsUsed ?? 0) + 1} of {max}. If you miss, wait {status?.cooldownHours ?? QUIZ_FALLBACK.cooldownHours} hours to retry.</li>
          <li><Clock size={14} aria-hidden="true" /> No timer. Take your time.</li>
        </ul>
        {error && <Notice>{friendlyError(error)}</Notice>}
        <div className="row-gap">
          <Link to={back} className="btn btn-cream"><ArrowLeft size={16} aria-hidden="true" /> Not now</Link>
          <button className="btn btn-gold" onClick={start}>{error ? "Try again" : "Begin the quiz"} <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      </Frame>
    );
  }

  if (phase === "result" && result) {
    return <Result result={result} topicName={topicName} status={status} back={back} />;
  }

  /* playing */
  const q = quiz.questions[index];
  const last = index === quiz.questions.length - 1;

  return (
    <div className="quiz-play">
      <div className="quiz-top">
        <button className="link-btn" onClick={() => setLeaving(true)}><ArrowLeft size={15} aria-hidden="true" /> Leave</button>
        <span>{topicName}</span>
        <span>{answered}/{quiz.questions.length} answered</span>
      </div>
      <div className="bar" role="progressbar" aria-valuemin={1} aria-valuemax={quiz.questions.length} aria-valuenow={index + 1} aria-label="Question progress">
        <span style={{ width: `${((index + 1) / quiz.questions.length) * 100}%` }} />
      </div>

      <Frame className="question">
        <span className="kicker">QUESTION {index + 1} OF {quiz.questions.length}</span>
        <h2>{q.question}</h2>

        <div className="options" role="radiogroup" aria-label="Answer options">
          {q.options.map((opt, i) => (
            <button key={i} role="radio" aria-checked={answers[index] === i}
              className={`option ${answers[index] === i ? "option-on" : ""}`}
              onClick={() => setAnswers((a) => a.map((v, k) => (k === index ? i : v)))}>
              <span className="option-letter" aria-hidden="true">{LETTERS[i]}</span>
              {opt}
            </button>
          ))}
        </div>

        {error && <Notice>{friendlyError(error)}</Notice>}

        <div className="row">
          <button className="btn btn-cream" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
          {!last ? (
            <button className="btn btn-gold" onClick={() => setIndex(index + 1)}>Next <ArrowRight size={16} aria-hidden="true" /></button>
          ) : (
            <button className="btn btn-gold" disabled={answered < quiz.questions.length} onClick={submit}>
              {answered < quiz.questions.length ? `Answer all (${quiz.questions.length - answered} left)` : "Submit answers"}
            </button>
          )}
        </div>
      </Frame>

      <div className="dots" aria-label="Jump to question">
        {quiz.questions.map((_, i) => (
          <button key={i} onClick={() => setIndex(i)} aria-label={`Question ${i + 1}${answers[i] !== null ? ", answered" : ""}`}
            className={`qdot ${answers[i] !== null ? "qdot-done" : ""} ${i === index ? "qdot-now" : ""}`} />
        ))}
      </div>

      <ConfirmDialog open={leaving} title="Leave the quiz?" confirmLabel="Leave" danger onCancel={() => setLeaving(false)} onConfirm={() => navigate(back)}>
        <p>Your answers aren't saved, so you'd start this attempt again. (Leaving before you submit doesn't use up an attempt.)</p>
      </ConfirmDialog>
    </div>
  );
}

function Result({ result, topicName, status, back }) {
  const navigate = useNavigate();
  const { score, passed, feedback = [], attempt } = result;
  const max = status?.maxAttempts ?? QUIZ_FALLBACK.maxAttempts;
  const left = Math.max(0, max - (attempt?.attemptNumber || 1));
  const cool = status?.cooldownHours ?? QUIZ_FALLBACK.cooldownHours;
  const correct = useMemo(() => feedback.filter((f) => f.isCorrect).length, [feedback]);

  return (
    <div className="quiz-result">
      <Frame className="result-card">
        <Mascot who={passed ? "hazel" : "wren"} size={120} />
        <div className="ring" style={{ "--pct": `${score}%` }} data-pass={passed} role="img" aria-label={`Score ${score} percent`}>
          <div><strong>{score}%</strong><small>{correct}/{feedback.length}</small></div>
        </div>
        <h1>{passed ? "Gate unlocked!" : "Not quite there yet"}</h1>
        <p>
          {passed
            ? `You passed ${topicName}. A verified badge was added to your vault, and the topic's tasks are now verified.`
            : left > 0
            ? `You need ${status?.passingScore ?? QUIZ_FALLBACK.passingScore}% to pass. You have ${left} attempt${left === 1 ? "" : "s"} left, available in ${cool} hours. Review the answers below first.`
            : "You've used all your attempts for this topic."}
        </p>
        <div className="row-gap">
          <button className="btn btn-cream" onClick={() => navigate(back, { state: passed ? { justPassed: topicName } : undefined })}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to {back === "/roadmap" ? "the roadmap" : "fundamentals"}
          </button>
          {passed && <Link to="/vault" className="btn btn-gold"><Medal size={16} aria-hidden="true" /> See my badge</Link>}
        </div>
      </Frame>

      <h2 className="review-title">Review your answers</h2>
      <div className="review">
        {feedback.map((f, i) => (
          <Frame key={f.questionId || i} className={`review-item ${f.isCorrect ? "ok" : "bad"}`}>
            <span className="review-mark" aria-label={f.isCorrect ? "Correct" : "Incorrect"}>{f.isCorrect ? <Check size={16} /> : <X size={16} />}</span>
            <div>
              <strong>{i + 1}. {f.question}</strong>
              {!f.isCorrect && <p className="wrong">Your answer: {f.selectedOption}</p>}
              <p className="right">Correct answer: {f.correctOption}</p>
              {f.explanation && <p className="why">{f.explanation}</p>}
            </div>
          </Frame>
        ))}
      </div>
    </div>
  );
}
