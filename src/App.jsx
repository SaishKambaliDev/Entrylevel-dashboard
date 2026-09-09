import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";

import Dashboard from "./Dashboard";
import Login from "./Login";
import Register from "./Register";
import SystemAdmin from "./SystemAdmin";
import ReportProblem from "./ReportProblem";
import TrackProblems from "./TrackProblems";
import HeiDashboard from "./HeiDashboard";
import IndustryDashboard from "./IndustryDashboard";
import GovernmentDashboard from "./GovernmentDashboard";

function CitizenOnlyRoute({ children }) {
  try {
    const user = JSON.parse(sessionStorage.getItem("jansamadhanUser") || "null");
    if (!sessionStorage.getItem("jansamadhanAuthToken")) return <Navigate to="/login" replace />;
    if (user?.role === "CITIZEN") return children;
  } catch (_error) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/" replace />;
}

function HeiOnlyRoute({ children }) {
  try {
    const user = JSON.parse(sessionStorage.getItem("jansamadhanUser") || "null");
    if (!sessionStorage.getItem("jansamadhanAuthToken")) return <Navigate to="/login" replace />;
    if (["HEI_ADMIN", "FACULTY", "STUDENT"].includes(user?.role)) return children;
  } catch (_error) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/" replace />;
}

function IndustryOnlyRoute({ children }) {
  try {
    const user = JSON.parse(sessionStorage.getItem("jansamadhanUser") || "null");
    if (!sessionStorage.getItem("jansamadhanAuthToken")) return <Navigate to="/login" replace />;
    if (["INDUSTRY_ADMIN", "INDUSTRY_MENTOR"].includes(user?.role)) return children;
  } catch (_error) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/" replace />;
}

function GovernmentOnlyRoute({ children }) {
  try {
    const user = JSON.parse(sessionStorage.getItem("jansamadhanUser") || "null");
    if (!sessionStorage.getItem("jansamadhanAuthToken")) return <Navigate to="/login" replace />;
    if (user?.role === "GOVERNMENT") return children;
  } catch (_error) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/" replace />;
}

function SystemAdminRoute() {
  try {
    const user = JSON.parse(sessionStorage.getItem("jansamadhanUser") || "null");
    if (sessionStorage.getItem("jansamadhanAuthToken") && user?.role === "SYSTEM_ADMIN") return <SystemAdmin />;
  } catch (_error) {
    // Invalid session data is treated as unauthenticated.
  }
  return <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* First page shown when website opens */}
        <Route path="/" element={<Dashboard />} />

        {/* Login page */}
        <Route path="/login" element={<Login />} />

        {/* Registration page */}
        <Route path="/register" element={<Register />} />

        <Route path="/system-admin" element={<SystemAdminRoute />} />
        <Route path="/report-problem" element={<CitizenOnlyRoute><ReportProblem /></CitizenOnlyRoute>} />
        <Route path="/track-problems" element={<CitizenOnlyRoute><TrackProblems /></CitizenOnlyRoute>} />
        <Route path="/hei" element={<HeiOnlyRoute><HeiDashboard /></HeiOnlyRoute>} />
        <Route path="/industry" element={<IndustryOnlyRoute><IndustryDashboard /></IndustryOnlyRoute>} />
        <Route path="/government" element={<GovernmentOnlyRoute><GovernmentDashboard /></GovernmentOnlyRoute>} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
