import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import lightLogo from "./assets/logoli.png";
import UtilityBar from "./UtilityBar";
import { usePreferences } from "./usePreferences";
import { authenticatedRequest } from "./api/referenceData";
import "./TrackProblems.css";

const TIMELINE_STAGES = [
  { id: "SUBMITTED", label: "Submitted" },
  { id: "UNDER_REVIEW", label: "Under Review" },
  { id: "UNDER_DEVELOPMENT", label: "Under Development" },
  { id: "VALIDATION", label: "Validation" },
  { id: "DEPLOYED", label: "Deployed" },
  { id: "COMPLETED", label: "Completed" },
];

function getStageIndex(status) {
  if (status === "SUBMITTED" || status === "AVAILABLE") return 0;
  if (status === "UNDER_REVIEW" || status === "ACCEPTED") return 1;
  if (status === "UNDER_DEVELOPMENT" || status === "MILESTONE_PROGRESS") return 2;
  if (status === "VALIDATION") return 3;
  if (status === "DEPLOYED") return 4;
  if (status === "COMPLETED") return 5;
  return 0;
}

function formatDate(dateString) {
  if (!dateString) return "Not specified";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function TrackProblems() {
  const routeLocation = useLocation();
  const [preferences, updatePreferences] = usePreferences();
  const [problems, setProblems] = useState([]);
  const [selectedProblemId, setSelectedProblemId] = useState(null);
  const [problemDetails, setProblemDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  // AI Analysis modal state shown immediately after submission
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPhase, setAiPhase] = useState("loading"); // loading | complete | failed
  const [aiResult, setAiResult] = useState(null);
  const aiPollRef = useRef(null);

  useEffect(() => {
    loadProblems();
  }, []);

  // When user came from submission, show the AI analysis modal and poll the problem detail
  useEffect(() => {
    let mounted = true;
    // If route indicates a just-submitted report, show the modal once we have loaded problems
    if (routeLocation.state?.submitted) {
      // If problems already loaded and we have selectedProblemId, handle it
      if (!loading && selectedProblemId) {
        setShowAiModal(true);
      } else {
        // Otherwise, wait for problems to finish loading and then show modal
        const unlisten = () => {
          if (!mounted) return;
          if (!loading && selectedProblemId) setShowAiModal(true);
        };
        // Poll until load completes (a short lived watcher)
        const watcher = setInterval(() => { if (!loading && selectedProblemId) { unlisten(); clearInterval(watcher); } }, 300);
      }
    }
    return () => { mounted = false; };
  }, [routeLocation.state, loading, selectedProblemId]);

  const loadProblems = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await authenticatedRequest("/problems/my");
      setProblems(data);
      if (data.length > 0) {
        setSelectedProblemId(data[0]._id);
        loadDetails(data[0]._id);
      }
    } catch (err) {
      setError(err.message || "Failed to load your submitted problems.");
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async (id) => {
    setDetailLoading(true);
    try {
      const data = await authenticatedRequest(`/problems/my/${id}`);
      setProblemDetails(data);
      return data;
    } catch (err) {
      setError(err.message || "Failed to load problem tracking details.");
      return null;
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectProblem = (id) => {
    setSelectedProblemId(id);
    // Stop any AI polling for previous modal
    if (aiPollRef.current) { clearInterval(aiPollRef.current); aiPollRef.current = null; }
    setShowAiModal(false); setAiPhase("loading"); setAiResult(null);
    loadDetails(id);
  };

  const retryAi = async () => {
    if (!problemDetails) return;
    setRetrying(true); setError("");
    try {
      await authenticatedRequest(`/problems/${problemDetails.problem.problemId}/retry-ai`, { method: "POST" });
      await loadProblems();
    } catch (err) { setError(err.message || "Unable to retry AI processing."); }
    finally { setRetrying(false); }
  };

  const currentStageIndex = problemDetails ? getStageIndex(problemDetails.problem.status) : 0;

  // Poll the existing problem detail API for AI status while the modal is shown
  useEffect(() => {
    if (!showAiModal || !selectedProblemId) return undefined;
    let active = true;
    setAiPhase("loading");
    setAiResult(null);

    async function check() {
      try {
        const latest = await authenticatedRequest(`/problems/my/${selectedProblemId}`);
        if (!active) return;
        // Update local problem details too
        setProblemDetails(latest);
        const status = latest.problem.ai?.processingStatus || "PENDING";
        if (status === "PENDING" || status === "PROCESSING") {
          setAiPhase("loading");
          return;
        }
        if (status === "FAILED") {
          setAiPhase("failed");
          // show briefly then close
          setTimeout(() => { setShowAiModal(false); setAiPhase("loading"); }, 2200);
          return;
        }
        // COMPLETED or NEEDS_REVIEW -> present summarized result
        const ai = latest.problem.ai || {};
        const recommendations = Array.isArray(ai.recommendations) ? ai.recommendations : [];
        const existingSolution = ai.solutionStatus === "EXISTING_SOLUTION" || recommendations.some((r) => r.type === "PROJECT");
        const schemeFound = ai.solutionStatus === "GOVERNMENT_SCHEME" || recommendations.some((r) => r.type === "GOVERNMENT_SCHEME");
        const accepted = ai.processingStatus === "COMPLETED" && ai.isCommunityProblem === true && ["GENERAL_GOVERNMENT","COLLABORATIVE"].includes(ai.classification);
        const result = {
          accepted,
          classification: ai.classification || null,
          responsibleStakeholder: ai.responsibleStakeholder || null,
          existingSolution,
          schemeFound,
          priority: typeof ai.finalPriorityScore === "number" ? ai.finalPriorityScore : (typeof ai.aiPriorityScore === "number" ? ai.aiPriorityScore : null),
        };
        setAiResult(result);
        setAiPhase("complete");
        // After brief display, automatically close the modal and proceed
        setTimeout(() => { setShowAiModal(false); setAiPhase("loading"); }, 2600);
      } catch (err) {
        // If polling fails (network), treat as failed analysis after a short retry window
        console.warn("AI poll failed:", err);
      }
    }

    // Initial immediate check then interval
    check();
    aiPollRef.current = setInterval(check, 2500);

    return () => { active = false; if (aiPollRef.current) { clearInterval(aiPollRef.current); aiPollRef.current = null; } };
  }, [showAiModal, selectedProblemId]);

  return (
    <div className={`track-page track-theme-${preferences.theme}`}>
      <UtilityBar preferences={preferences} updatePreferences={updatePreferences} />

      <header className="track-header">
        <div className="track-header-left">
          <Link to="/" aria-label="JanSamadhan Home">
            <img src={lightLogo} alt="JanSamadhan Logo" />
          </Link>
          <div className="track-header-title">
            <span>Track Problem Status</span>
            <small>Follow real-time progress on your reported civic issues</small>
          </div>
        </div>
        <div className="track-header-right">
          <Link to="/report-problem" className="btn-report-new">+ Report New Problem</Link>
          <Link to="/" className="back-link">Back to Home</Link>
        </div>
      </header>

      <main className="track-main">
        {routeLocation.state?.submitted && <div className="track-success" role="status">Your report was saved. AI processing is now underway.</div>}

        {/* AI Analysis Modal shown immediately after submission */}
        {showAiModal && (
          <div className="ai-modal-overlay" role="dialog" aria-modal="true" aria-label="AI Analysis">
            <div className="ai-modal-card" role="document">
              {aiPhase === "loading" && (
                <div className="ai-modal-center">
                  <div className="ai-spinner" aria-hidden="true"><span /></div>
                  <h3>Analyzing your problem...</h3>
                  <p className="ai-sub">JanSamadhan is identifying the domain and appropriate routing. This usually takes a few seconds.</p>
                </div>
              )}

              {aiPhase === "complete" && aiResult && (
                <div className="ai-modal-center">
                  <div className="ai-result-icon">{aiResult.accepted ? "✓" : "✕"}</div>
                  <h3>{aiResult.accepted ? "Problem accepted" : "Problem not suitable / needs review"}</h3>

                  <div className="ai-summary">
                    <div><strong>Domain:</strong> {aiResult.classification || "Not available"}</div>
                    <div><strong>Responsible:</strong> {aiResult.responsibleStakeholder || "Not available"}</div>
                    <div><strong>Existing solution found:</strong> {aiResult.existingSolution ? "Yes" : "No"}</div>
                    <div><strong>Government scheme found:</strong> {aiResult.schemeFound ? "Yes" : "No"}</div>
                    <div><strong>Priority:</strong> {typeof aiResult.priority === "number" ? `${aiResult.priority}/100` : "Not available"}</div>
                  </div>
                </div>
              )}

              {aiPhase === "failed" && (
                <div className="ai-modal-center">
                  <div className="ai-result-icon">⚠️</div>
                  <h3>AI analysis unavailable</h3>
                  <p className="ai-sub">We couldn't complete automated analysis at this time. You can still track the problem below.</p>
                </div>
              )}
            </div>
          </div>
        )}
        {error && <div className="track-error" role="alert">{error}</div>}

        {loading ? (
          <div className="track-loading" role="status">Loading your reported problems…</div>
        ) : problems.length === 0 ? (
          <div className="track-empty-state">
            <div className="empty-icon">📋</div>
            <h2>No Problems Reported Yet</h2>
            <p>You haven't submitted any civic issues yet. Spot something in your locality?</p>
            <Link to="/report-problem" className="btn-primary-action">Report a Problem Now</Link>
          </div>
        ) : (
          <div className="track-layout">
            {/* Sidebar list of citizen's problems */}
            <aside className="track-sidebar" aria-label="Your reported problems">
              <h3>My Reports ({problems.length})</h3>
              <ul className="problem-nav-list">
                {problems.map((p) => (
                  <li key={p._id}>
                    <button
                      type="button"
                      className={selectedProblemId === p._id ? "is-selected" : ""}
                      onClick={() => handleSelectProblem(p._id)}
                    >
                      <div className="item-top">
                        <span className="item-id">{p.problemId}</span>
                        <span className="item-date">{formatDate(p.createdAt)}</span>
                      </div>
                      <p className="item-desc">{p.description.slice(0, 75)}…</p>
                      <div className="item-footer">
                        <span className="item-status">{p.displayStatus || p.status}</span>
                        {p.assignedHeiName && <span className="item-hei">🏛 {p.assignedHeiName}</span>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            {/* Problem Details & Timeline */}
            <section className="track-detail-area">
              {detailLoading || !problemDetails ? (
                <div className="track-loading" role="status">Loading tracking details…</div>
              ) : (
                <article className="track-detail-card">
                  <div className="track-card-header">
                    <div>
                      <span className="track-domain-tag">{problemDetails.problem.domain || "Civic Issue"}</span>
                      <h2>Problem ID: {problemDetails.problem.problemId}</h2>
                      <p className="track-submission-date">Submitted on {formatDate(problemDetails.problem.createdAt)}</p>
                    </div>
                    <div className="track-current-status-box">
                      <span className="status-label">Current Status</span>
                      <span className="status-badge">{problemDetails.displayStatus}</span>
                    </div>
                  </div>

                  {/* Visual Stepper Timeline */}
                  <div className="timeline-container">
                    <h3>Resolution Progress</h3>
                    <div className="timeline-steps">
                      {TIMELINE_STAGES.map((stage, idx) => {
                        const isDone = idx < currentStageIndex;
                        const isCurrent = idx === currentStageIndex;
                        return (
                          <div
                            key={stage.id}
                            className={`timeline-step ${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`}
                          >
                            <div className="step-circle">
                              {isDone ? "✓" : idx + 1}
                            </div>
                            <span className="step-label">{stage.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Assignment & Timeline Banner */}
                  <div className="assigned-hei-banner">
                    {problemDetails.assignedHeiName ? (
                      <div className="hei-info">
                        <div className="hei-icon">🏛</div>
                        <div>
                          <strong>Assigned HEI / Institution:</strong>
                          <p>{problemDetails.assignedHeiName}</p>
                          {problemDetails.project?.expectedCompletionDate && (
                            <small>Target Completion: {formatDate(problemDetails.project.expectedCompletionDate)}</small>
                          )}
                        </div>
                      </div>
                    ) : problemDetails.problem.ai?.classification === "GENERAL_GOVERNMENT" ? (
                      <div className="hei-pending-info"><div className="pending-icon">🏛</div><div><strong>Routed to Government:</strong><p>This civic issue is being handled through the responsible government channel.</p></div></div>
                    ) : problemDetails.problem.ai?.isCommunityProblem === false ? (
                      <div className="hei-pending-info"><div className="pending-icon">ℹ️</div><div><strong>Not a community problem:</strong><p>This report does not meet the platform's public community-problem criteria.</p></div></div>
                    ) : problemDetails.problem.ai?.duplicateOf ? (
                      <div className="hei-pending-info"><div className="pending-icon">🔗</div><div><strong>Merged with an existing report:</strong><p>Your report has been counted against the existing community issue.</p></div></div>
                    ) : (
                      <div className="hei-pending-info">
                        <div className="pending-icon">⏳</div>
                        <div>
                          <strong>Awaiting HEI Acceptance:</strong>
                          <p>Your problem is published and available for eligible Higher Education Institutions in Jharkhand to undertake.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="detail-section">
                    <h4>AI processing</h4>
                    <p>{problemDetails.problem.ai?.processingStatus || "PENDING"}{problemDetails.problem.ai?.classification ? ` · ${problemDetails.problem.ai.classification.replaceAll("_", " ")}` : ""}</p>

                    {/* Show backend-provided AI error (truncated) to aid debugging */}
                    {problemDetails.problem.ai?.error && (
                      <div className="ai-error" style={{ marginTop: 8 }}>
                        <strong>AI error:</strong>
                        <pre className="ai-error-text" style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{String(problemDetails.problem.ai.error).slice(0, 1000)}</pre>
                      </div>
                    )}

                    {["FAILED", "NEEDS_REVIEW"].includes(problemDetails.problem.ai?.processingStatus) && <button type="button" className="btn-primary-action" disabled={retrying} onClick={retryAi}>{retrying ? "Retrying…" : "Retry AI processing"}</button>}
                  </div>

                  {/* Problem Description & Location */}
                  <div className="detail-section">
                    <h4>Problem Details</h4>
                    <p className="detail-description">{problemDetails.problem.description}</p>
                    <div className="detail-meta-pills">
                      <span>📍 <strong>Location:</strong> {problemDetails.problem.location?.displayName || problemDetails.problem.location?.district || "Jharkhand"}</span>
                      {problemDetails.problem.attachments?.length > 0 && (
                        <span>📎 <strong>Attachments:</strong> {problemDetails.problem.attachments.length} file(s)</span>
                      )}
                    </div>
                  </div>

                  {/* Proposed Solution (if HEI formulated one) */}
                  {problemDetails.project?.proposedSolution?.approach && (
                    <div className="detail-section solution-highlight">
                      <h4>💡 HEI Proposed Solution</h4>
                      <p><strong>Approach:</strong> {problemDetails.project.proposedSolution.approach}</p>
                      {problemDetails.project.proposedSolution.expectedOutcome && (
                        <p><strong>Expected Outcome:</strong> {problemDetails.project.proposedSolution.expectedOutcome}</p>
                      )}
                    </div>
                  )}

                  {/* Milestones (if any defined by HEI) */}
                  {problemDetails.milestones?.length > 0 && (
                    <div className="detail-section">
                      <h4>Project Milestones</h4>
                      <div className="milestones-track-list">
                        {problemDetails.milestones.map((m, idx) => (
                          <div key={m._id} className="milestone-track-item">
                            <div className="milestone-track-header">
                              <span className="m-step-num">Stage {idx + 1}</span>
                              <strong>{m.title}</strong>
                              <span className={`m-status-pill status-${m.status?.toLowerCase()}`}>{m.status}</span>
                            </div>
                            {m.description && <p className="m-desc">{m.description}</p>}
                            <div className="m-progress-row">
                              <div className="m-bar">
                                <div className="m-fill" style={{ width: `${m.completionPercentage}%` }} />
                              </div>
                              <span className="m-pct">{m.completionPercentage}%</span>
                            </div>
                            {m.report && <p className="m-report"><strong>Update:</strong> {m.report}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default TrackProblems;
