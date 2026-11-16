import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { PLAN_LIMITS } from "../config/constants";

const OnboardingContext = createContext(null);
export const useOnboarding = () => useContext(OnboardingContext);

const initialPlan = {
  hoursPerDay: PLAN_LIMITS.hoursPerDay.default,
  daysPerWeek: PLAN_LIMITS.daysPerWeek.default,
  bufferInterval: PLAN_LIMITS.bufferInterval.default,
};

/**
 * State for the 4-step flow. It lives only while /onboarding/* is open;
 * refreshing the page restarts at step 1 (as the spec asks).
 *   skills: { [topicId]: { proficiency, confidence?, fromResume? } }  (present = ticked)
 */
export function OnboardingProvider({ children }) {
  const [roleId, setRoleIdState] = useState("");
  const [skills, setSkills] = useState({});
  const [gapTopicIds, setGapTopicIds] = useState(null); // null = not computed yet
  const [removedIds, setRemovedIds] = useState([]);
  const [inconsistencies, setInconsistencies] = useState([]);
  const [dismissed, setDismissed] = useState([]);
  const [plan, setPlan] = useState(initialPlan);
  const [replaceAcknowledged, setReplaceAcknowledged] = useState(false);

  const resetFromSkills = useCallback(() => {
    setGapTopicIds(null);
    setRemovedIds([]);
    setInconsistencies([]);
    setDismissed([]);
  }, []);

  const setRoleId = useCallback(
    (id) => {
      setRoleIdState(id);
      setSkills({});
      resetFromSkills();
    },
    [resetFromSkills]
  );

  const value = useMemo(
    () => ({
      roleId, setRoleId,
      skills, setSkills,
      gapTopicIds, setGapTopicIds,
      removedIds, setRemovedIds,
      inconsistencies, setInconsistencies,
      dismissed, setDismissed,
      plan, setPlan,
      replaceAcknowledged, setReplaceAcknowledged,
      resetFromSkills,
      /** topics that will actually be sent to estimate + generate */
      finalGapIds: (gapTopicIds || []).filter((id) => !removedIds.includes(id)),
    }),
    [roleId, setRoleId, skills, gapTopicIds, removedIds, inconsistencies, dismissed, plan, replaceAcknowledged, resetFromSkills]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
