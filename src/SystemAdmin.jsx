import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import lightLogo from "./assets/logoli.png";
import darkLogo from "./assets/logoda.png";
import { authenticatedRequest } from "./api/referenceData";
import UtilityBar from "./UtilityBar";
import { usePreferences } from "./usePreferences";
import "./SystemAdmin.css";

const roleLabels = { HEI_ADMIN: "HEI Admin", FACULTY: "Faculty", STUDENT: "Student", INDUSTRY_ADMIN: "Organization Admin", INDUSTRY_MENTOR: "Industry Mentor", GOVERNMENT: "Government" };

function applicationOrganization(user) {
  if (user.institutionName) return user.institutionName;
  if (user.organizationName) return user.organizationType ? `${user.organizationName} · ${user.organizationType}` : user.organizationName;
  if (user.governmentLevel) return [user.department, user.districtName, user.governmentLevel].filter(Boolean).join(" · ");
  return "Details not provided";
}

function SystemAdmin() {
  const [preferences, updatePreferences] = usePreferences();
  const { theme } = preferences;
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reviewingId, setReviewingId] = useState("");

  useEffect(() => {
    let isCurrent = true;
    authenticatedRequest("/admin/users/pending").then((users) => {
      if (isCurrent) setApplications(users);
    }).catch((requestError) => {
      if (isCurrent) setError(requestError.message || "Unable to load pending accounts.");
    }).finally(() => {
      if (isCurrent) setLoading(false);
    });
    return () => { isCurrent = false; };
  }, []);

  const updateStatus = async (id, decision) => {
    setError("");
    setNotice("");
    setReviewingId(id);
    try {
      await authenticatedRequest(`/admin/users/${id}/review`, { method: "PATCH", body: { decision } });
      setApplications((current) => current.filter((application) => application._id !== id));
      setNotice(`Account ${decision === "approve" ? "approved" : "rejected"}.`);
    } catch (requestError) {
      setError(requestError.message || "Unable to update the account.");
    } finally {
      setReviewingId("");
    }
  };

  return <div className={`admin-page admin-theme-${theme}`}>
    <UtilityBar preferences={preferences} updatePreferences={updatePreferences} />
    <header className="admin-header"><Link to="/" className="admin-logo" aria-label="JanSamadhan home"><img src={theme === "light" ? lightLogo : darkLogo} alt="JanSamadhan — Initiative by Government of Jharkhand" /></Link><div className="admin-header-actions"><span>System Admin</span></div></header>
    <main className="admin-main"><div className="admin-heading"><div><p>Account management</p><h1>Registration requests</h1><span>Review pending HEI, Industry, and Government account requests.</span></div><div className="admin-count"><strong>{applications.length}</strong><span>Pending review</span></div></div>
      <section className="admin-panel" aria-labelledby="requests-title"><div className="admin-toolbar"><h2 id="requests-title">Pending applications</h2></div>
        {notice && <p className="admin-notice" role="status">{notice}</p>}{error && <p className="admin-notice" role="alert">{error}</p>}
        <div className="admin-list">{loading ? <p className="admin-empty">Loading pending applications…</p> : applications.length ? applications.map((application) => <article key={application._id} className="admin-application"><div className="admin-application-copy"><div><span className="admin-status">Pending Approval</span><small>{application._id} · Submitted {new Date(application.createdAt).toLocaleDateString()}</small></div><h3>{application.name}</h3><p>{roleLabels[application.role] || application.role} · {applicationOrganization(application)}</p></div><div className="admin-actions"><button type="button" className="admin-reject" disabled={reviewingId === application._id} onClick={() => updateStatus(application._id, "reject")}>Reject</button><button type="button" className="admin-approve" disabled={reviewingId === application._id} onClick={() => updateStatus(application._id, "approve")}>{reviewingId === application._id ? "Saving…" : "Approve"}</button></div></article>) : <p className="admin-empty">There are no pending applications.</p>}</div>
      </section>
      <p className="admin-footnote">Only real accounts awaiting verification are shown here.</p>
    </main>
  </div>;
}

export default SystemAdmin;
