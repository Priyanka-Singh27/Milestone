import { useCallback, useEffect, useRef, useState } from "react";
import { quizApi } from "../api";

/**
 * Loads GET /quiz/status/:topicId for each topic id (attempts used, cooldown,
 * passed…). Used for topics whose lessons are finished, so the quiz button can
 * say "Take quiz", "Available in 7h 30m", "No attempts left" or "Passed".
 */
export function useQuizStatuses(topicIds) {
  const [statuses, setStatuses] = useState({});
  const requested = useRef(new Set());
  const key = topicIds.join("|");

  const fetchOne = useCallback(async (id) => {
    try {
      const data = await quizApi.status(id);
      setStatuses((s) => ({ ...s, [id]: data.status || data }));
    } catch {
      /* the quiz button simply falls back to "Take quiz"; the server re-checks anyway */
    }
  }, []);

  useEffect(() => {
    topicIds.slice(0, 12).forEach((id) => {
      if (!requested.current.has(id)) {
        requested.current.add(id);
        fetchOne(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refresh = useCallback(
    (id) => {
      requested.current.add(id);
      return fetchOne(id);
    },
    [fetchOne]
  );

  return { statuses, refresh };
}
