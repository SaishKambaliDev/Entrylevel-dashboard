import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import lightLogo from "./assets/logoli.png";
import UtilityBar from "./UtilityBar";
import { usePreferences, getCurrentUser } from "./usePreferences";
import { authenticatedRequest } from "./api/referenceData";
import "./HeiDashboard.css";

function formatDate(dateString) {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function HeiDashboard() {
  const navigate = useNavigate();
  const [preferences, updatePreferences] = usePreferences();
  const user = getCurrentUser();

  const [activeTab, setActiveTab] = useState("overview"); // overview, problems, projects, domains
  const [analytics, setAnalytics] = useState(null);
  const [availableProblems, setAvailableProblems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [domainConfig, setDomainConfig] = useState({ allDomains: [], selectedDomains: [] });
  const [collaborations, setCollaborations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });

  // Modals & Form states
  const [rejectModal, setRejectModal] = useState({ open: false, problem: null, reason: "" });
  const [collabRejectModal, setCollabRejectModal] = useState({ open: false, collab: null, reason: "" });
  const [milestoneModal, setMilestoneModal] = useState({ open: false, title: "", description: "", expectedCompletionDate: "" });
  const [proposedSolutionForm, setProposedSolutionForm] = useState({ approach: "", expectedOutcome: "", requiredResources: "", expectedTimeline: "" });

  const isHeiAdmin = user?.role === "HEI_ADMIN";

  useEffect(() => {
    loadTabContent(activeTab);
  }, [activeTab]);

  const loadTabContent = async (tab) => {
    setLoading(true);
    setNotice({ type: "", message: "" });
    try {
      if (tab === "overview") {
        const data = await authenticatedRequest("/hei/analytics");
        setAnalytics(data);
      } else if (tab === "problems") {
        const data = await authenticatedRequest("/hei/problems");
        setAvailableProblems(data);
      } else if (tab === "projects") {
        const data = await authenticatedRequest("/hei/projects");
        setProjects(data);
        if (data.length > 0 && !selectedProject) {
          loadProjectDetails(data[0]._id);
        }
      } else if (tab === "domains") {
        const data = await authenticatedRequest("/hei/domains");
        setDomainConfig(data);
      } else if (tab === "collaborations") {
        const data = await authenticatedRequest("/hei/collaboration-requests");
        setCollaborations(data);
      }
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to load data." });
    } finally {
      setLoading(false);
    }
  };

  const loadProjectDetails = async (projectId) => {
    setActionLoading(true);
    try {
      const data = await authenticatedRequest(`/hei/projects/${projectId}`);
      setSelectedProject(data);
      setProposedSolutionForm({
        approach: data.project.proposedSolution?.approach || "",
        expectedOutcome: data.project.proposedSolution?.expectedOutcome || "",
        requiredResources: data.project.proposedSolution?.requiredResources || "",
        expectedTimeline: data.project.proposedSolution?.expectedTimeline || "",
      });
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to load project details." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptProblem = async (problemId) => {
    setActionLoading(true);
    setNotice({ type: "", message: "" });
    try {
      const res = await authenticatedRequest(`/hei/problems/${problemId}/accept`, { method: "POST" });
      setNotice({ type: "success", message: "Problem accepted successfully! A new project has been initiated." });
      setAvailableProblems((prev) => prev.filter((p) => p._id !== problemId && p.problemId !== problemId));
      if (analytics) {
        setAnalytics((prev) => ({
          ...prev,
          totalAvailableProblems: Math.max(0, prev.totalAvailableProblems - 1),
          totalAccepted: prev.totalAccepted + 1,
          activeProjects: prev.activeProjects + 1,
        }));
      }
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Acceptance failed." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectProblem = async () => {
    if (!rejectModal.problem) return;
    setActionLoading(true);
    setNotice({ type: "", message: "" });
    try {
      await authenticatedRequest(`/hei/problems/${rejectModal.problem._id}/reject`, {
        method: "POST",
        body: { rejectionReason: rejectModal.reason },
      });
      setNotice({ type: "info", message: "Problem rejected for this institution." });
      setAvailableProblems((prev) => prev.filter((p) => p._id !== rejectModal.problem._id));
      setRejectModal({ open: false, problem: null, reason: "" });
      if (analytics) {
        setAnalytics((prev) => ({
          ...prev,
          totalAvailableProblems: Math.max(0, prev.totalAvailableProblems - 1),
          totalRejected: prev.totalRejected + 1,
        }));
      }
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Rejection failed." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveCollab = async (collabId) => {
    setActionLoading(true);
    setNotice({ type: "", message: "" });
    try {
      await authenticatedRequest(`/hei/collaboration-requests/${collabId}/approve`, { method: "POST" });
      setNotice({ type: "success", message: "Collaboration request approved successfully!" });
      loadTabContent("collaborations");
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to approve collaboration." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectCollab = async () => {
    if (!collabRejectModal.collab?._id) return;
    setActionLoading(true);
    setNotice({ type: "", message: "" });
    try {
      await authenticatedRequest(`/hei/collaboration-requests/${collabRejectModal.collab._id}/reject`, {
        method: "POST",
        body: { rejectionReason: collabRejectModal.reason },
      });
      setNotice({ type: "success", message: "Collaboration request rejected." });
      setCollabRejectModal({ open: false, collab: null, reason: "" });
      loadTabContent("collaborations");
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to reject collaboration." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveDomains = async () => {
    setActionLoading(true);
    setNotice({ type: "", message: "" });
    try {
      const res = await authenticatedRequest("/hei/domains", {
        method: "PUT",
        body: { domains: domainConfig.selectedDomains },
      });
      setNotice({ type: "success", message: "Institution domains updated successfully." });
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to update domains." });
    } finally {
      setActionLoading(false);
    }
  };

  const toggleDomain = (domainId) => {
    setDomainConfig((prev) => {
      const exists = prev.selectedDomains.includes(domainId);
      const next = exists
        ? prev.selectedDomains.filter((id) => id !== domainId)
        : [...prev.selectedDomains, domainId];
      return { ...prev, selectedDomains: next };
    });
  };

  const handleUpdateProjectStatus = async (newStatus) => {
    if (!selectedProject?.project?._id) return;
    setActionLoading(true);
    try {
      const res = await authenticatedRequest(`/hei/projects/${selectedProject.project._id}`, {
        method: "PUT",
        body: { status: newStatus },
      });
      setSelectedProject((prev) => ({
        ...prev,
        project: { ...prev.project, status: res.status },
      }));
      setNotice({ type: "success", message: `Project status updated to ${newStatus}.` });
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to update project status." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveProposedSolution = async () => {
    if (!selectedProject?.project?._id) return;
    setActionLoading(true);
    try {
      await authenticatedRequest(`/hei/projects/${selectedProject.project._id}`, {
        method: "PUT",
        body: { proposedSolution: proposedSolutionForm },
      });
      setNotice({ type: "success", message: "Proposed solution saved." });
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to save solution." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddMilestone = async (e) => {
    e.preventDefault();
    if (!selectedProject?.project?._id || !milestoneModal.title.trim()) return;
    setActionLoading(true);
    try {
      const res = await authenticatedRequest(`/hei/projects/${selectedProject.project._id}/milestones`, {
        method: "POST",
        body: {
          title: milestoneModal.title.trim(),
          description: milestoneModal.description.trim(),
          expectedCompletionDate: milestoneModal.expectedCompletionDate || undefined,
        },
      });
      setSelectedProject((prev) => ({
        ...prev,
        milestones: [...(prev.milestones || []), res],
      }));
      setMilestoneModal({ open: false, title: "", description: "", expectedCompletionDate: "" });
      setNotice({ type: "success", message: "Milestone added successfully." });
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to add milestone." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateMilestone = async (milestoneId, updates) => {
    setActionLoading(true);
    try {
      const res = await authenticatedRequest(`/hei/milestones/${milestoneId}`, {
        method: "PUT",
        body: updates,
      });
      setSelectedProject((prev) => ({
        ...prev,
        milestones: prev.milestones.map((m) => (m._id === milestoneId ? res : m)),
      }));
      setNotice({ type: "success", message: "Milestone updated." });
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to update milestone." });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className={`hei-page hei-theme-${preferences.theme}`}>
      <UtilityBar preferences={preferences} updatePreferences={updatePreferences} />

      <header className="hei-header">
        <div className="hei-header-left">
          <Link to="/" aria-label="JanSamadhan Home">
            <img src={lightLogo} alt="JanSamadhan Logo" />
          </Link>
          <div className="hei-portal-badge">
            <span>HEI Portal</span>
            <small>{user?.institutionName || "Higher Education Institution"}</small>
          </div>
        </div>
        <div className="hei-header-right">
          <span className="user-role-tag">{user?.role?.replace("_", " ")}</span>
          <Link to="/" className="back-link">Back to Home</Link>
        </div>
      </header>

      <main className="hei-main">
        {/* Navigation Tabs */}
        <nav className="hei-nav-tabs" aria-label="HEI Navigation">
          <button
            type="button"
            className={activeTab === "overview" ? "is-active" : ""}
            onClick={() => setActiveTab("overview")}
          >
            📊 Overview & Analytics
          </button>
          <button
            type="button"
            className={activeTab === "problems" ? "is-active" : ""}
            onClick={() => setActiveTab("problems")}
          >
            🔍 Discover Problems
          </button>
          <button
            type="button"
            className={activeTab === "projects" ? "is-active" : ""}
            onClick={() => setActiveTab("projects")}
          >
            📁 Projects & Milestones
          </button>
          {isHeiAdmin && (
            <button
              type="button"
              className={activeTab === "domains" ? "is-active" : ""}
              onClick={() => setActiveTab("domains")}
            >
              ⚙️ Domain Expertise
            </button>
          )}
          <button
            type="button"
            className={activeTab === "collaborations" ? "is-active" : ""}
            onClick={() => setActiveTab("collaborations")}
          >
            🤝 Industry Collaborations
            {collaborations.filter((c) => c.status === "PENDING").length > 0 && (
              <span className="hei-nav-badge" style={{ marginLeft: "0.4rem", padding: "0.1rem 0.45rem", borderRadius: "9999px", background: "#fef3c7", color: "#b45309", fontSize: "0.75rem", fontWeight: 700 }}>
                {collaborations.filter((c) => c.status === "PENDING").length}
              </span>
            )}
          </button>
        </nav>

        {notice.message && (
          <div className={`hei-alert hei-alert-${notice.type}`} role="status">
            <span>{notice.message}</span>
            <button type="button" onClick={() => setNotice({ type: "", message: "" })}>✕</button>
          </div>
        )}

        {loading ? (
          <div className="hei-loading" role="status">Loading data…</div>
        ) : (
          <>
            {/* TAB 1: OVERVIEW & ANALYTICS */}
            {activeTab === "overview" && analytics && (
              <section className="hei-tab-content">
                <div className="hei-section-title">
                  <h2>Institutional Activity & Metrics</h2>
                  <p>Real-time indicators based on verified citizen problems and active student/faculty projects.</p>
                </div>

                <div className="analytics-grid">
                  <div className="metric-card highlight">
                    <span className="metric-num">{analytics.totalAvailableProblems}</span>
                    <span className="metric-label">Problems Available</span>
                    <small>In your domain expertise</small>
                  </div>
                  <div className="metric-card">
                    <span className="metric-num">{analytics.totalAccepted}</span>
                    <span className="metric-label">Problems Accepted</span>
                    <small>Committed to solution</small>
                  </div>
                  <div className="metric-card">
                    <span className="metric-num">{analytics.activeProjects}</span>
                    <span className="metric-label">Active Projects</span>
                    <small>Currently in development</small>
                  </div>
                  <div className="metric-card">
                    <span className="metric-num">{analytics.completedProjects}</span>
                    <span className="metric-label">Completed Solutions</span>
                    <small>Deployed & verified</small>
                  </div>
                  <div className="metric-card">
                    <span className="metric-num">{analytics.completionRate}%</span>
                    <span className="metric-label">Completion Rate</span>
                    <small>Ratio of resolved projects</small>
                  </div>
                  <div className="metric-card">
                    <span className="metric-num">{analytics.delayedProjects}</span>
                    <span className="metric-label">Projects Delayed</span>
                    <small>Past expected timeline</small>
                  </div>
                </div>

                <div className="hei-quick-actions">
                  <h3>Quick Actions</h3>
                  <div className="quick-action-buttons">
                    <button type="button" onClick={() => setActiveTab("problems")}>Browse Available Problems →</button>
                    <button type="button" onClick={() => setActiveTab("projects")}>Manage Current Projects →</button>
                    {isHeiAdmin && (
                      <button type="button" onClick={() => setActiveTab("domains")}>Configure Domains →</button>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* TAB 2: DISCOVER PROBLEMS */}
            {activeTab === "problems" && (
              <section className="hei-tab-content">
                <div className="hei-section-title">
                  <h2>Available Citizen Problems</h2>
                  <p>Browse problems submitted by citizens across Jharkhand that match your institution's expertise.</p>
                </div>

                {availableProblems.length === 0 ? (
                  <div className="hei-empty-state">
                    <p>No available problems matching your domain expertise at this moment.</p>
                    {isHeiAdmin && (
                      <button type="button" onClick={() => setActiveTab("domains")}>Update Domain Expertise</button>
                    )}
                  </div>
                ) : (
                  <div className="problem-card-list">
                    {availableProblems.map((prob) => (
                      <article key={prob._id} className="hei-problem-card">
                        <div className="card-top-row">
                          <span className="card-domain-badge">{prob.domain || "OTHER"}</span>
                          <span className="card-prob-id">{prob.problemId}</span>
                          <span className="card-date">{formatDate(prob.createdAt)}</span>
                        </div>

                        <h3 className="card-desc">{prob.description}</h3>

                        <div className="card-meta-row">
                          <span>📍 {prob.location?.displayName || prob.location?.district || "Jharkhand"}</span>
                          <span>
                            👤 {prob.isAnonymous ? "Anonymous Citizen" : prob.reporterSnapshot?.name || "Citizen"}
                          </span>
                          {prob.attachments?.length > 0 && (
                            <span>📎 {prob.attachments.length} attachment(s)</span>
                          )}
                        </div>

                        <div className="card-action-row">
                          <button
                            type="button"
                            className="btn-accept"
                            disabled={actionLoading}
                            onClick={() => handleAcceptProblem(prob._id)}
                          >
                            ✓ Accept Problem
                          </button>
                          <button
                            type="button"
                            className="btn-reject"
                            disabled={actionLoading}
                            onClick={() => setRejectModal({ open: true, problem: prob, reason: "" })}
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* TAB 3: PROJECTS & MILESTONES */}
            {activeTab === "projects" && (
              <section className="hei-tab-content hei-projects-layout">
                <div className="projects-sidebar">
                  <h3>Your Accepted Projects</h3>
                  {projects.length === 0 ? (
                    <p className="no-projects-text">No projects yet. Accept a problem from Discover Problems to start.</p>
                  ) : (
                    <ul className="project-list">
                      {projects.map((proj) => (
                        <li key={proj._id}>
                          <button
                            type="button"
                            className={selectedProject?.project?._id === proj._id ? "is-selected" : ""}
                            onClick={() => loadProjectDetails(proj._id)}
                          >
                            <strong>{proj.title || `Project: ${proj.problemId?.problemId}`}</strong>
                            <span className={`status-pill status-${proj.status?.toLowerCase()}`}>{proj.status}</span>
                            <small>{proj.problemId?.domain || "General"} · {formatDate(proj.createdAt)}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="project-detail-area">
                  {selectedProject ? (
                    <div className="project-detail-card">
                      <div className="project-detail-header">
                        <div>
                          <h2>{selectedProject.project.title}</h2>
                          <p className="project-subhead">
                            Problem Ref: <strong>{selectedProject.project.problemId?.problemId}</strong> · Location: {selectedProject.project.problemId?.location?.displayName || "Jharkhand"}
                          </p>
                        </div>
                        <div className="project-status-control">
                          <label htmlFor="status-select">Status:</label>
                          <select
                            id="status-select"
                            value={selectedProject.project.status}
                            disabled={actionLoading}
                            onChange={(e) => handleUpdateProjectStatus(e.target.value)}
                          >
                            <option value="ACCEPTED">Under Review</option>
                            <option value="UNDER_DEVELOPMENT">Under Development</option>
                            <option value="VALIDATION">Validation</option>
                            <option value="DEPLOYED">Deployed</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="ON_HOLD">On Hold</option>
                          </select>
                        </div>
                      </div>

                      <div className="original-problem-quote">
                        <strong>Citizen's Problem Description:</strong>
                        <p>{selectedProject.project.problemId?.description}</p>
                      </div>

                      {/* Proposed Solution Section */}
                      <section className="solution-section">
                        <h3>Proposed Solution</h3>
                        <div className="solution-form">
                          <div className="form-group">
                            <label>Approach & Methodology</label>
                            <textarea
                              rows={2}
                              placeholder="Describe the solution approach…"
                              value={proposedSolutionForm.approach}
                              onChange={(e) => setProposedSolutionForm({ ...proposedSolutionForm, approach: e.target.value })}
                            />
                          </div>
                          <div className="form-group">
                            <label>Expected Outcome</label>
                            <input
                              type="text"
                              placeholder="e.g. Clean drinking water supply restored"
                              value={proposedSolutionForm.expectedOutcome}
                              onChange={(e) => setProposedSolutionForm({ ...proposedSolutionForm, expectedOutcome: e.target.value })}
                            />
                          </div>
                          <div className="form-group">
                            <label>Required Resources</label>
                            <input
                              type="text"
                              placeholder="e.g. IoT sensors, solar panel, student team"
                              value={proposedSolutionForm.requiredResources}
                              onChange={(e) => setProposedSolutionForm({ ...proposedSolutionForm, requiredResources: e.target.value })}
                            />
                          </div>
                          <button
                            type="button"
                            className="btn-save-solution"
                            disabled={actionLoading}
                            onClick={handleSaveProposedSolution}
                          >
                            Save Solution Details
                          </button>
                        </div>
                      </section>

                      {/* Milestones Section */}
                      <section className="milestones-section">
                        <div className="milestones-header">
                          <h3>Project Milestones</h3>
                          <button
                            type="button"
                            className="btn-add-milestone"
                            onClick={() => setMilestoneModal({ open: true, title: "", description: "", expectedCompletionDate: "" })}
                          >
                            + Add Milestone
                          </button>
                        </div>

                        {selectedProject.milestones?.length === 0 ? (
                          <p className="no-milestones">No milestones defined yet. Create milestones to track progress toward deployment.</p>
                        ) : (
                          <div className="milestones-list">
                            {selectedProject.milestones.map((m, idx) => (
                              <div key={m._id} className="milestone-card">
                                <div className="milestone-top">
                                  <span className="milestone-index">#{idx + 1}</span>
                                  <h4>{m.title}</h4>
                                  <span className={`milestone-status status-${m.status?.toLowerCase()}`}>{m.status}</span>
                                </div>
                                {m.description && <p className="milestone-desc">{m.description}</p>}
                                <div className="milestone-progress-bar">
                                  <div className="progress-fill" style={{ width: `${m.completionPercentage}%` }} />
                                </div>
                                <div className="milestone-meta">
                                  <span>Progress: <strong>{m.completionPercentage}%</strong></span>
                                  <span>Due: {formatDate(m.expectedCompletionDate)}</span>
                                  {m.report && <span>Report: {m.report}</span>}
                                </div>
                                <div className="milestone-actions">
                                  {m.status !== "COMPLETED" && (
                                    <button
                                      type="button"
                                      className="btn-complete-milestone"
                                      onClick={() => handleUpdateMilestone(m._id, { status: "COMPLETED", completionPercentage: 100 })}
                                    >
                                      Mark Completed
                                    </button>
                                  )}
                                  {m.status === "NOT_STARTED" && (
                                    <button
                                      type="button"
                                      className="btn-start-milestone"
                                      onClick={() => handleUpdateMilestone(m._id, { status: "IN_PROGRESS", completionPercentage: 25 })}
                                    >
                                      Start Working
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  ) : (
                    <div className="hei-empty-state">
                      <p>Select a project from the list to view and manage milestones.</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* TAB 4: DOMAIN EXPERTISE */}
            {activeTab === "domains" && isHeiAdmin && (
              <section className="hei-tab-content">
                <div className="hei-section-title">
                  <h2>Select Institution Domains</h2>
                  <p>Choose the problem domains your college or university has the faculty, labs, or students to undertake.</p>
                </div>

                <div className="domains-checklist">
                  {domainConfig.allDomains.map((domain) => {
                    const checked = domainConfig.selectedDomains.includes(domain.id);
                    return (
                      <label key={domain.id} className={`domain-checkbox-label ${checked ? "is-selected" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDomain(domain.id)}
                        />
                        <div className="domain-info">
                          <strong>{domain.name}</strong>
                          <small>Code: {domain.id}</small>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="domains-save-bar">
                  <button
                    type="button"
                    className="btn-save-domains"
                    disabled={actionLoading}
                    onClick={handleSaveDomains}
                  >
                    Save Domain Expertise
                  </button>
                </div>
              </section>
            )}

            {/* TAB 5: INDUSTRY COLLABORATIONS */}
            {activeTab === "collaborations" && (
              <section className="hei-tab-content">
                <div className="hei-section-title">
                  <h2>Industry Collaboration Requests</h2>
                  <p>Review partnership proposals from industries and startups offering funding, prototypes, testing, or mentorship.</p>
                </div>

                {collaborations.length === 0 ? (
                  <div className="empty-state">
                    <p>No industry collaboration requests received yet.</p>
                  </div>
                ) : (
                  <div className="problems-grid">
                    {collaborations.map((collab) => (
                      <article key={collab._id} className="problem-card">
                        <div className="problem-header">
                          <span className={`status-badge status-${collab.status.toLowerCase()}`}>
                            {collab.status}
                          </span>
                          <span className="domain-badge">
                            {collab.problemId?.domain?.replaceAll("_", " ") || "CIVIC"}
                          </span>
                        </div>

                        <h4 style={{ margin: "0.5rem 0 0.25rem", fontSize: "1.05rem" }}>
                          {collab.industryId?.organizationName || "Industry Partner"}
                        </h4>
                        <small style={{ color: "var(--hei-muted)" }}>
                          {collab.industryId?.organizationType} · {collab.industryId?.district?.name || "Jharkhand"}
                        </small>

                        <div style={{ margin: "0.75rem 0", padding: "0.6rem 0.8rem", background: "var(--hei-surface-subtle)", borderRadius: "6px", fontSize: "0.85rem" }}>
                          <strong>Project:</strong> {collab.projectId?.title || collab.problemId?.title}
                        </div>

                        {collab.message && (
                          <p style={{ fontSize: "0.85rem", color: "var(--hei-muted)", margin: "0.5rem 0" }}>
                            <em>&ldquo;{collab.message}&rdquo;</em>
                          </p>
                        )}

                        <div style={{ marginTop: "0.5rem" }}>
                          <small style={{ fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
                            Capabilities Offered:
                          </small>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                            {(collab.capabilitiesOffered || []).map((cap) => (
                              <span key={cap} className="domain-badge" style={{ fontSize: "0.7rem" }}>
                                {cap.replaceAll("_", " ")}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="problem-footer" style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--hei-border)" }}>
                          <small style={{ color: "var(--hei-muted)" }}>
                            Date: {formatDate(collab.createdAt)}
                          </small>
                          {collab.status === "PENDING" && (
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button
                                type="button"
                                className="btn-reject"
                                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
                                onClick={() => setCollabRejectModal({ open: true, collab, reason: "" })}
                                disabled={actionLoading}
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                className="btn-accept"
                                style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
                                onClick={() => handleApproveCollab(collab._id)}
                                disabled={actionLoading}
                              >
                                Approve
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Reject Modal */}
      {rejectModal.open && (
        <div className="hei-modal-backdrop" role="dialog" aria-modal="true">
          <div className="hei-modal">
            <h3>Reject Problem</h3>
            <p>This problem will be excluded from your list, but will remain available for other eligible HEIs.</p>
            <textarea
              rows={3}
              placeholder="Reason for rejection (e.g. Lab equipment unavailable, out of geographical focus)…"
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
            />
            <div className="modal-buttons">
              <button type="button" className="btn-cancel" onClick={() => setRejectModal({ open: false, problem: null, reason: "" })}>Cancel</button>
              <button type="button" className="btn-confirm-reject" onClick={handleRejectProblem} disabled={actionLoading}>Confirm Rejection</button>
            </div>
          </div>
        </div>
      )}

      {/* Collab Reject Modal */}
      {collabRejectModal.open && (
        <div className="hei-modal-backdrop" role="dialog" aria-modal="true">
          <div className="hei-modal">
            <h3>Reject Collaboration Request</h3>
            <p>
              Are you sure you want to decline collaboration with{" "}
              <strong>{collabRejectModal.collab?.industryId?.organizationName}</strong>?
            </p>
            <textarea
              rows={3}
              placeholder="Reason for rejection (e.g. Project already fully funded, outside scope)…"
              value={collabRejectModal.reason}
              onChange={(e) => setCollabRejectModal({ ...collabRejectModal, reason: e.target.value })}
            />
            <div className="modal-buttons">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setCollabRejectModal({ open: false, collab: null, reason: "" })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-confirm-reject"
                onClick={handleRejectCollab}
                disabled={actionLoading}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Milestone Modal */}
      {milestoneModal.open && (
        <div className="hei-modal-backdrop" role="dialog" aria-modal="true">
          <div className="hei-modal">
            <h3>Add Project Milestone</h3>
            <form onSubmit={handleAddMilestone}>
              <div className="form-group">
                <label>Milestone Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Problem Study & Field Inspection"
                  value={milestoneModal.title}
                  onChange={(e) => setMilestoneModal({ ...milestoneModal, title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows={2}
                  placeholder="What will be accomplished in this stage…"
                  value={milestoneModal.description}
                  onChange={(e) => setMilestoneModal({ ...milestoneModal, description: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Expected Completion Date</label>
                <input
                  type="date"
                  value={milestoneModal.expectedCompletionDate}
                  onChange={(e) => setMilestoneModal({ ...milestoneModal, expectedCompletionDate: e.target.value })}
                />
              </div>
              <div className="modal-buttons">
                <button type="button" className="btn-cancel" onClick={() => setMilestoneModal({ open: false, title: "", description: "", expectedCompletionDate: "" })}>Cancel</button>
                <button type="submit" className="btn-confirm-add" disabled={actionLoading}>Create Milestone</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default HeiDashboard;

