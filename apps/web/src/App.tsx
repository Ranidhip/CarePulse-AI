import { Navigate, Route, Routes } from "react-router-dom";
import ProviderSignIn from "./pages/provider/ProviderSignIn";
import ProviderLayout from "./pages/provider/ProviderLayout";
import Dashboard from "./pages/provider/Dashboard";
import Alerts from "./pages/provider/Alerts";
import Patients from "./pages/provider/Patients";
import Settings from "./pages/provider/Settings";
import PatientRecord from "./pages/provider/PatientRecord";
import RiskAssessmentReview from "./pages/provider/RiskAssessmentReview";
import RecordFollowUp from "./pages/provider/RecordFollowUp";
import FollowUpHistory from "./pages/provider/FollowUpHistory";
import FollowUpTasks from "./pages/provider/FollowUpTasks";
import { RequireProviderSession } from "./lib/providerSession";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/provider" replace />} />
      <Route path="/provider/sign-in" element={<ProviderSignIn />} />

      <Route element={<RequireProviderSession />}>
        <Route path="/provider" element={<ProviderLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="patients" element={<Patients />} />
          <Route path="follow-up-tasks" element={<FollowUpTasks />} />
          <Route path="settings" element={<Settings />} />
          <Route path="patients/:patientId" element={<PatientRecord />} />
          <Route path="patients/:patientId/risk-review" element={<RiskAssessmentReview />} />
          <Route path="patients/:patientId/follow-up" element={<RecordFollowUp />} />
          <Route path="patients/:patientId/history" element={<FollowUpHistory />} />
        </Route>
      </Route>
    </Routes>
  );
}

