import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { API_BASE_URL } from "./config/constants";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { AuthProvider } from "./context/AuthContext";
import { RolesProvider } from "./context/RolesContext";
import { RoadmapProvider } from "./context/RoadmapContext";
import AppShell from "./components/AppShell";
import { PostLogin, ProtectedRoute, PublicOnly } from "./components/RouteGuards";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import Roadmap from "./pages/Roadmap";
import Quiz from "./pages/Quiz";
import Fundamentals from "./pages/Fundamentals";
import Applications from "./pages/Applications";
import Vault from "./pages/Vault";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import OnboardingLayout from "./pages/onboarding/OnboardingLayout";
import RoleStep from "./pages/onboarding/RoleStep";
import SkillsStep from "./pages/onboarding/SkillsStep";
import GapStep from "./pages/onboarding/GapStep";
import PlanStep from "./pages/onboarding/PlanStep";
import { Frame } from "./components/ui";

/** A production build without VITE_API_BASE_URL can never work: say so clearly. */
function MissingConfig() {
  return (
    <div className="page">
      <Frame className="state-card">
        <h1 className="h3">Setup needed</h1>
        <p>
          This site isn't connected to its server yet. The deployment is missing the
          <code> VITE_API_BASE_URL </code> setting.
        </p>
      </Frame>
    </div>
  );
}

export default function App() {
  if (!API_BASE_URL) return <MissingConfig />;

  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <RolesProvider>
              <RoadmapProvider>
                <Routes>
                  {/* public */}
                  <Route path="/" element={<PublicOnly><Landing /></PublicOnly>} />
                  <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
                  <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
                  <Route path="/auth/callback" element={<AuthCallback />} />

                  {/* signed in */}
                  <Route element={<ProtectedRoute />}>
                    <Route element={<AppShell />}>
                      <Route path="/continue" element={<PostLogin />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/roadmap" element={<Roadmap />} />
                      <Route path="/quiz/:topicId" element={<Quiz />} />
                      <Route path="/fundamentals" element={<Fundamentals />} />
                      <Route path="/applications" element={<Applications />} />
                      <Route path="/vault" element={<Vault />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/onboarding" element={<OnboardingLayout />}>
                        <Route index element={<Navigate to="role" replace />} />
                        <Route path="role" element={<RoleStep />} />
                        <Route path="skills" element={<SkillsStep />} />
                        <Route path="gap" element={<GapStep />} />
                        <Route path="plan" element={<PlanStep />} />
                      </Route>
                    </Route>
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </RoadmapProvider>
            </RolesProvider>
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
