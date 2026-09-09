import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import lightLogo from "./assets/logoli.png";
import UtilityBar from "./UtilityBar";
import { usePreferences } from "./usePreferences";
import { authenticatedRequest, getDomains } from "./api/referenceData";
import "./GovernmentDashboard.css";

// ── Shared helpers ────────────────────────────────────────────────────────────

let DOMAIN_OPTIONS = [];

const STATUS_LABELS = {
  SUBMITTED: "Submitted", AVAILABLE: "Available",
  UNDER_REVIEW: "Under Review", ACCEPTED: "Under Review",
  UNDER_DEVELOPMENT: "Under Development", MILESTONE_PROGRESS: "Under Development",
  VALIDATION: "Validation", DEPLOYED: "Deployed",
  COMPLETED: "Completed", REJECTED: "On Hold", ON_HOLD: "On Hold", CANCELLED: "Cancelled",
};

const PROJECT_STATUS_LABELS = {
  ACCEPTED: "Accepted", UNDER_DEVELOPMENT: "Under Development",
  VALIDATION: "Validation", DEPLOYED: "Deployed",
  COMPLETED: "Completed", ON_HOLD: "On Hold",
};

function formatDate(dateString) {
  if (!dateString) return "Not specified";
  return new Date(dateString).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function domainLabel(id) {
  return DOMAIN_OPTIONS.find((d) => d.id === id)?.label || id || "Other";
}

// ── Report a Problem (inline, same logic as citizen) ─────────────────────────

const MAX_TOTAL_SIZE = 100 * 1024 * 1024;
const acceptedTypes = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const mapBounds = { minLat: 21.9, maxLat: 25.35, minLng: 83.3, maxLng: 87.95 };
const locationLabel = (loc) => loc ? loc.displayName || `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}` : "Not selected";
const formatSize = (bytes) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function LocationPicker({ location, setLocation, error, setError }) {
  const [mode, setMode] = useState("map");
  const mapRef = useRef(null);
  const selectMapPoint = (event) => {
    const bounds = mapRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    setLocation({ latitude: mapBounds.maxLat - y * (mapBounds.maxLat - mapBounds.minLat), longitude: mapBounds.minLng + x * (mapBounds.maxLng - mapBounds.minLng), displayName: "Selected point in Jharkhand" });
    setError("");
  };
  const useCurrentLocation = () => {
    if (!navigator.geolocation) { setError("Location access not supported. Select on map."); return; }
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLocation({ latitude: coords.latitude, longitude: coords.longitude, displayName: "Current device location" }),
      (geoError) => setError(geoError.code === 1 ? "Location permission denied. Select on map." : "Could not determine location."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };
  const mapPoint = location && location.latitude >= mapBounds.minLat && location.latitude <= mapBounds.maxLat
    ? { left: `${((location.longitude - mapBounds.minLng) / (mapBounds.maxLng - mapBounds.minLng)) * 100}%`, top: `${((mapBounds.maxLat - location.latitude) / (mapBounds.maxLat - mapBounds.minLat)) * 100}%` } : null;
  return (
    <div className="gov-location-picker">
      <div className="gov-location-options">
        <button type="button" className={mode === "map" ? "is-selected" : ""} onClick={() => setMode("map")}>Select on Jharkhand map</button>
        <button type="button" className={mode === "device" ? "is-selected" : ""} onClick={() => { setMode("device"); useCurrentLocation(); }}>Use my current location</button>
      </div>
      <div ref={mapRef} className="gov-jharkhand-map" role="button" tabIndex="0" aria-label="Jharkhand map. Click to select the problem location." onClick={selectMapPoint} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectMapPoint({ clientX: mapRef.current.getBoundingClientRect().left + mapRef.current.offsetWidth / 2, clientY: mapRef.current.getBoundingClientRect().top + mapRef.current.offsetHeight / 2 }); }}>
        <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M42 5 62 10 73 21 70 34 85 42 80 56 89 68 76 79 69 94 54 89 43 97 28 88 21 75 10 64 18 51 12 39 25 30 28 14Z" /></svg>
        <span className="gov-map-title">Jharkhand</span>
        {mapPoint && <i className="gov-map-pin" style={mapPoint} aria-label="Selected location" />}
      </div>
      <p className="gov-location-selected"><strong>Selected location:</strong> {locationLabel(location)}</p>
      {error && <p className="gov-error" role="alert">{error}</p>}
    </div>
  );
}

function ReportProblemTab({ user, onSubmitted }) {
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("OTHER");
  const [location, setLocation] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const recognitionSupported = useMemo(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition), []);
  const totalSize = attachments.reduce((t, f) => t + f.size, 0);

  const next = () => {
    if (step === 1 && !description.trim()) { setError("Please describe the problem."); return; }
    if (step === 2 && !location) { setError("Select the problem location."); return; }
    setError(""); setStep((s) => s + 1);
  };
  const addFiles = (event) => {
    const incoming = Array.from(event.target.files || []);
    if (incoming.some((f) => !f.size)) { setError("Empty files cannot be attached."); return; }
    if (incoming.some((f) => !acceptedTypes.has(f.type))) { setError("Attach images, videos, PDFs, Word or text files only."); return; }
    if (totalSize + incoming.reduce((t, f) => t + f.size, 0) > MAX_TOTAL_SIZE) { setError("Total attachments must not exceed 100 MB."); return; }
    setAttachments((c) => [...c, ...incoming]); setError(""); event.target.value = "";
  };
  const startVoice = () => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) return;
    const r = new R(); r.lang = "en-IN";
    r.onstart = () => setVoiceActive(true);
    r.onresult = (e) => { setDescription((c) => `${c}${c ? " " : ""}${e.results[0][0].transcript}`); setError(""); };
    r.onerror = () => setError("Voice input failed. Please type instead.");
    r.onend = () => setVoiceActive(false); r.start();
  };
  const submit = async () => {
    setSubmitting(true); setError("");
    try {
      const fd = new FormData();
      fd.append("description", description.trim());
      fd.append("domain", domain);
      fd.append("location", JSON.stringify(location));
      fd.append("isAnonymous", "false");
      attachments.forEach((f) => fd.append("attachments", f));
      await authenticatedRequest("/problems", { method: "POST", body: fd });
      onSubmitted();
    } catch (err) {
      setError(err.message || "Unable to submit the problem.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="gov-report-wrap">
      <div className="gov-report-card">
        <div className="gov-step-progress">
          <span>Step {step} of 5</span>
          <div className="gov-step-bar"><i style={{ width: `${step * 20}%` }} /></div>
        </div>

        {step === 1 && (
          <>
            <p className="gov-eyebrow">Step 1 · Problem details</p>
            <h2>Describe the problem</h2>
            <p className="gov-help">Explain what is happening and anything that would help someone understand it.</p>
            <textarea value={description} maxLength="5000" onChange={(e) => { setDescription(e.target.value); setError(""); }} placeholder="For example: The road near village X has large potholes causing accidents…" />
            <div className="gov-under-input">
              <span>{description.length}/5000</span>
              {recognitionSupported && <button type="button" className="gov-voice-btn" onClick={startVoice} disabled={voiceActive}>{voiceActive ? "Listening…" : "🎤 Voice Input"}</button>}
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 6 }}>Problem Category / Domain</label>
              <select value={domain} onChange={(e) => setDomain(e.target.value)} className="gov-select">
                {DOMAIN_OPTIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="gov-eyebrow">Step 2 · Problem location</p>
            <h2>Where is the problem?</h2>
            <p className="gov-help">Choose the location where this problem exists.</p>
            <LocationPicker location={location} setLocation={setLocation} error={error} setError={setError} />
          </>
        )}

        {step === 3 && (
          <>
            <p className="gov-eyebrow">Step 3 · Attachments</p>
            <h2>Add supporting files</h2>
            <p className="gov-help">Images, videos, PDFs, Word documents, and text files are supported. Total limit: 100 MB.</p>
            <label className="gov-file-picker">Choose files<input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,application/pdf,.doc,.docx,text/plain,.txt" onChange={addFiles} /></label>
            <p className="gov-attach-total">{attachments.length} file{attachments.length === 1 ? "" : "s"} · {formatSize(totalSize)} of 100 MB</p>
            <div className="gov-attach-list">
              {attachments.map((f, i) => (
                <div key={`${f.name}-${i}`}>
                  <span><strong>{f.name}</strong><small>{f.type || "File"} · {formatSize(f.size)}</small></span>
                  <button type="button" onClick={() => setAttachments((c) => c.filter((_, fi) => fi !== i))}>Remove</button>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <p className="gov-eyebrow">Step 4 · Reporter details</p>
            <h2>Reporter identity</h2>
            <p className="gov-help">This problem will be submitted as a Government report from your account.</p>
            <div className="gov-reporter-info">
              <span>👤 <strong>{user.name}</strong></span>
              <span>🏛️ Government — {user.governmentLevel?.toUpperCase()}</span>
              <span>🏢 {user.department}</span>
              {user.districtName && <span>📍 {user.districtName} District</span>}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <p className="gov-eyebrow">Step 5 · Review</p>
            <h2>Ready to submit?</h2>
            <dl className="gov-review-list">
              <div><dt>Problem</dt><dd>{description}</dd></div>
              <div><dt>Category</dt><dd>{DOMAIN_OPTIONS.find((d) => d.id === domain)?.label || domain}</dd></div>
              <div><dt>Location</dt><dd>{locationLabel(location)}</dd></div>
              <div><dt>Attachments</dt><dd>{attachments.length} file{attachments.length === 1 ? "" : "s"}</dd></div>
              <div><dt>Reporter</dt><dd>{user.name} · Government {user.governmentLevel?.toUpperCase()}</dd></div>
            </dl>
          </>
        )}

        {error && step !== 2 && <p className="gov-error" role="alert">{error}</p>}

        <div className="gov-report-actions">
          {step > 1 ? (
            <button type="button" className="gov-btn-back" onClick={() => { setError(""); setStep((s) => s - 1); }}>Back</button>
          ) : (
            <span />
          )}
          {step < 5 ? (
            <button type="button" className="gov-btn-next" onClick={next}>Next</button>
          ) : (
            <button type="button" className="gov-btn-submit" disabled={submitting} onClick={submit}>{submitting ? "Submitting…" : "Submit Problem"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Track My Problems (inline, calls same /problems/my endpoints) ─────────────

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

function TrackMyProblemsTab() {
  const [problems, setProblems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await authenticatedRequest("/problems/my");
        setProblems(data);
        if (data.length > 0) { setSelectedId(data[0]._id); loadDetails(data[0]._id); }
      } catch (err) { setError(err.message || "Failed to load problems."); }
      finally { setLoading(false); }
    })();
  }, []);

  const loadDetails = async (id) => {
    setDetailLoading(true);
    try {
      const data = await authenticatedRequest(`/problems/my/${id}`);
      setDetails(data);
    } catch (err) { setError(err.message || "Failed to load details."); }
    finally { setDetailLoading(false); }
  };

  const stageIndex = details ? getStageIndex(details.problem.status) : 0;

  if (loading) return <div className="gov-loading">Loading your submitted problems…</div>;
  if (error) return <div className="gov-error-block" role="alert">{error}</div>;
  if (problems.length === 0) return (
    <div className="gov-empty-state">
      <div className="gov-empty-icon">📋</div>
      <h3>No Problems Submitted Yet</h3>
      <p>Use the "Report a Problem" tab to submit your first problem.</p>
    </div>
  );

  return (
    <div className="gov-track-layout">
      <aside className="gov-track-sidebar">
        <h3>My Submissions ({problems.length})</h3>
        <ul>
          {problems.map((p) => (
            <li key={p._id}>
              <button type="button" className={selectedId === p._id ? "is-selected" : ""} onClick={() => { setSelectedId(p._id); loadDetails(p._id); }}>
                <div className="gov-item-top"><span className="gov-item-id">{p.problemId}</span><span className="gov-item-date">{formatDate(p.createdAt)}</span></div>
                <p className="gov-item-desc">{p.description.slice(0, 80)}…</p>
                <div className="gov-item-footer">
                  <span className="gov-status-pill">{STATUS_LABELS[p.status] || p.status}</span>
                  {p.assignedHeiName && <span className="gov-item-hei">🏛 {p.assignedHeiName}</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="gov-track-detail">
        {detailLoading || !details ? (
          <div className="gov-loading">Loading tracking details…</div>
        ) : (
          <article className="gov-detail-card">
            <div className="gov-detail-header">
              <div>
                <span className="gov-domain-tag">{domainLabel(details.problem.domain)}</span>
                <h2>Problem ID: {details.problem.problemId}</h2>
                <p className="gov-sub-date">Submitted on {formatDate(details.problem.createdAt)}</p>
              </div>
              <div className="gov-status-box">
                <span>Current Status</span>
                <span className="gov-status-badge">{details.displayStatus || STATUS_LABELS[details.problem.status]}</span>
              </div>
            </div>

            <div className="gov-timeline">
              <h4>Resolution Progress</h4>
              <div className="gov-timeline-steps">
                {TIMELINE_STAGES.map((stage, idx) => (
                  <div key={stage.id} className={`gov-step ${idx < stageIndex ? "is-done" : ""} ${idx === stageIndex ? "is-current" : ""}`}>
                    <div className="gov-step-circle">{idx < stageIndex ? "✓" : idx + 1}</div>
                    <span>{stage.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="gov-hei-banner">
              {details.assignedHeiName ? (
                <div className="gov-hei-info">
                  <span>🏛</span>
                  <div>
                    <strong>Assigned HEI:</strong> {details.assignedHeiName}
                    {details.project?.expectedCompletionDate && <small> · Target: {formatDate(details.project.expectedCompletionDate)}</small>}
                  </div>
                </div>
              ) : (
                <div className="gov-hei-pending"><span>⏳</span><div><strong>Awaiting HEI:</strong> Your problem is published and available for HEIs to undertake.</div></div>
              )}
            </div>

            <div className="gov-detail-section">
              <h4>Problem Details</h4>
              <p>{details.problem.description}</p>
              <div className="gov-meta-pills">
                <span>📍 {details.problem.location?.displayName || details.problem.location?.district || "Jharkhand"}</span>
                {details.problem.attachments?.length > 0 && <span>📎 {details.problem.attachments.length} attachment(s)</span>}
              </div>
            </div>

            {details.project?.proposedSolution?.approach && (
              <div className="gov-detail-section gov-solution">
                <h4>💡 HEI Proposed Solution</h4>
                <p><strong>Approach:</strong> {details.project.proposedSolution.approach}</p>
                {details.project.proposedSolution.expectedOutcome && <p><strong>Expected Outcome:</strong> {details.project.proposedSolution.expectedOutcome}</p>}
              </div>
            )}

            {details.milestones?.length > 0 && (
              <div className="gov-detail-section">
                <h4>Project Milestones</h4>
                <div className="gov-milestones-list">
                  {details.milestones.map((m, idx) => (
                    <div key={m._id} className="gov-milestone-item">
                      <div className="gov-milestone-header">
                        <span className="gov-m-num">Stage {idx + 1}</span>
                        <strong>{m.title}</strong>
                        <span className={`gov-m-pill status-${m.status?.toLowerCase()}`}>{m.status}</span>
                      </div>
                      {m.description && <p>{m.description}</p>}
                      <div className="gov-m-bar-row">
                        <div className="gov-m-bar"><div className="gov-m-fill" style={{ width: `${m.completionPercentage}%` }} /></div>
                        <span>{m.completionPercentage}%</span>
                      </div>
                      {m.report && <p><strong>Update:</strong> {m.report}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        )}
      </section>
    </div>
  );
}

// ── Project Detail Modal ──────────────────────────────────────────────────────

function ProjectDetailModal({ projectId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const result = await authenticatedRequest(`/government/projects/${projectId}`);
        setData(result);
      } catch (err) { setError(err.message || "Failed to load project details."); }
      finally { setLoading(false); }
    })();
  }, [projectId]);

  return (
    <div className="gov-modal-overlay" role="dialog" aria-modal="true">
      <div className="gov-modal">
        <div className="gov-modal-header">
          <h2>Project Details</h2>
          <button type="button" className="gov-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="gov-modal-body">
          {loading && <div className="gov-loading">Loading project details…</div>}
          {error && <div className="gov-error-block">{error}</div>}
          {data && (
            <>
              <div className="gov-proj-detail-section">
                <h3>Problem</h3>
                <p className="gov-proj-desc">{data.problem.description}</p>
                <div className="gov-meta-pills">
                  <span>🏷 {domainLabel(data.problem.domain)}</span>
                  <span>📍 {data.problem.location?.displayName || data.problem.location?.district || "Jharkhand"}</span>
                  <span>📅 Reported: {formatDate(data.problem.createdAt)}</span>
                </div>
              </div>

              <div className="gov-proj-detail-section">
                <h3>HEI / Institution</h3>
                <div className="gov-hei-info-card">
                  <strong>{data.project.institutionId?.institutionName || "—"}</strong>
                  {data.project.institutionId?.aisheCode && <span>AISHE: {data.project.institutionId.aisheCode}</span>}
                </div>
              </div>

              <div className="gov-proj-detail-section">
                <h3>Project</h3>
                <div className="gov-proj-meta-row">
                  <span>Status: <strong>{PROJECT_STATUS_LABELS[data.project.status] || data.project.status}</strong></span>
                  <span>Progress: <strong>{data.progress}%</strong></span>
                  {data.project.expectedCompletionDate && (
                    <span>Target: <strong>{formatDate(data.project.expectedCompletionDate)}</strong></span>
                  )}
                </div>
                <div className="gov-progress-bar-large">
                  <div className="gov-progress-fill" style={{ width: `${data.progress}%` }} />
                </div>
                {data.project.proposedSolution?.approach && (
                  <div style={{ marginTop: 10 }}>
                    <p><strong>Approach:</strong> {data.project.proposedSolution.approach}</p>
                    {data.project.proposedSolution.expectedOutcome && <p><strong>Expected Outcome:</strong> {data.project.proposedSolution.expectedOutcome}</p>}
                  </div>
                )}
              </div>

              {data.milestones.length > 0 && (
                <div className="gov-proj-detail-section">
                  <h3>Milestones ({data.milestones.length})</h3>
                  <div className="gov-milestones-list">
                    {data.milestones.map((m, idx) => (
                      <div key={m._id} className="gov-milestone-item">
                        <div className="gov-milestone-header">
                          <span className="gov-m-num">{idx + 1}</span>
                          <strong>{m.title}</strong>
                          <span className={`gov-m-pill status-${m.status?.toLowerCase()}`}>{m.status}</span>
                        </div>
                        <div className="gov-m-bar-row">
                          <div className="gov-m-bar"><div className="gov-m-fill" style={{ width: `${m.completionPercentage}%` }} /></div>
                          <span>{m.completionPercentage}%</span>
                        </div>
                        {m.report && <p><strong>Update:</strong> {m.report}</p>}
                        {m.expectedCompletionDate && <p><small>Target: {formatDate(m.expectedCompletionDate)}</small></p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.collaboration && (
                <div className="gov-proj-detail-section gov-collab-section">
                  <h3>🏢 Industry Collaboration</h3>
                  <div className="gov-collab-card">
                    <div className="gov-collab-header">
                      <strong>{data.collaboration.industryId?.organizationName || "Industry Partner"}</strong>
                      <span className={`gov-collab-badge gov-collab-${data.collaboration.status.toLowerCase()}`}>{data.collaboration.status}</span>
                    </div>
                    {data.collaboration.capabilitiesOffered?.length > 0 && (
                      <div className="gov-collab-caps">
                        {data.collaboration.capabilitiesOffered.map((c) => <span key={c} className="gov-cap-tag">{c.replaceAll("_", " ")}</span>)}
                      </div>
                    )}
                    {data.collaboration.supportCommitments?.funding?.amount > 0 && (
                      <p>💰 Funding: ₹{data.collaboration.supportCommitments.funding.amount.toLocaleString("en-IN")}</p>
                    )}
                    {data.collaboration.message && <p className="gov-collab-msg">{data.collaboration.message}</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Monitor Projects Tab ──────────────────────────────────────────────────────

function GeneralProblemsTab() {
  const [problems, setProblems] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { authenticatedRequest("/government/general-problems?limit=50").then((data) => setProblems(data.problems || [])).catch((err) => setError(err.message || "Failed to load general problems.")).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="gov-loading">Loading general problems…</div>;
  if (error) return <div className="gov-error-block">{error}</div>;
  return <div className="gov-monitor-tab"><p className="gov-result-count">{problems.length} general problem{problems.length !== 1 ? "s" : ""} in your authorized area</p><div className="gov-project-grid">{problems.map((p) => <article key={p._id} className="gov-project-card"><div className="gov-project-card-header"><span className="gov-domain-tag">{domainLabel(p.domain)}</span><span className="gov-proj-status-badge">Priority {p.ai?.finalPriorityScore ?? "—"}</span></div><p className="gov-project-desc">{p.description}</p><div className="gov-project-meta"><span>📍 {p.location?.district || "Assigned location"}</span><span>🏛 {p.ai?.responsibleGovernmentLevel || "Under review"}</span><span>👥 {p.ai?.reportCount || 1} reports</span></div></article>)}</div>{problems.length === 0 && <div className="gov-empty-state"><h3>No General Problems Found</h3><p>Processed government issues in your authorized area will appear here.</p></div>}</div>;
}

function MonitorProjectsTab() {
  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const load = async (params = {}) => {
    setLoading(true); setError("");
    try {
      const qs = new URLSearchParams({
        ...(params.domain || domain ? { domain: params.domain ?? domain } : {}),
        ...(params.status || status ? { status: params.status ?? status } : {}),
        ...(params.search || search ? { search: params.search ?? search } : {}),
        page: params.page ?? page,
        limit: 15,
      }).toString();
      const data = await authenticatedRequest(`/government/projects?${qs}`);
      setProjects(data.projects || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err) { setError(err.message || "Failed to load projects."); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const applyFilters = () => { setPage(1); load({ page: 1 }); };
  const clearFilters = () => { setDomain(""); setStatus(""); setSearch(""); setPage(1); load({ domain: "", status: "", search: "", page: 1 }); };

  return (
    <div className="gov-monitor-tab">
      {selectedProjectId && <ProjectDetailModal projectId={selectedProjectId} onClose={() => setSelectedProjectId(null)} />}

      <div className="gov-filter-bar">
        <input className="gov-search-input" placeholder="Search problems…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }} />
        <select className="gov-select-sm" value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="">All Domains</option>
          {DOMAIN_OPTIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <select className="gov-select-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="gov-btn-filter" onClick={applyFilters}>Apply</button>
        <button type="button" className="gov-btn-clear" onClick={clearFilters}>Clear</button>
      </div>

      {loading && <div className="gov-loading">Loading projects…</div>}
      {error && <div className="gov-error-block">{error}</div>}
      {!loading && !error && (
        <>
          <p className="gov-result-count">{total} project{total !== 1 ? "s" : ""} found</p>
          {projects.length === 0 ? (
            <div className="gov-empty-state">
              <div className="gov-empty-icon">📁</div>
              <h3>No Projects Found</h3>
              <p>No projects in your jurisdiction match the current filters.</p>
            </div>
          ) : (
            <div className="gov-project-grid">
              {projects.map((pr) => (
                <div key={pr._id} className="gov-project-card" onClick={() => setSelectedProjectId(pr._id)}>
                  <div className="gov-project-card-header">
                    <span className="gov-domain-tag">{domainLabel(pr.problem?.domain)}</span>
                    <span className={`gov-proj-status-badge status-${pr.status?.toLowerCase()}`}>{PROJECT_STATUS_LABELS[pr.status] || pr.status}</span>
                  </div>
                  <p className="gov-project-desc">{pr.problem?.description?.slice(0, 100)}…</p>
                  <div className="gov-project-meta">
                    {pr.institutionId?.institutionName && <span>🏛 {pr.institutionId.institutionName}</span>}
                    {pr.problem?.location?.district && <span>📍 {pr.problem.location.district}</span>}
                    {pr.expectedCompletionDate && <span>📅 {formatDate(pr.expectedCompletionDate)}</span>}
                  </div>
                  <div className="gov-proj-progress-row">
                    <div className="gov-m-bar"><div className="gov-m-fill" style={{ width: `${pr.progress}%` }} /></div>
                    <span className="gov-proj-pct">{pr.progress}%</span>
                  </div>
                  {pr.milestones?.delayed > 0 && <div className="gov-delay-badge">⚠ {pr.milestones.delayed} delayed milestone{pr.milestones.delayed > 1 ? "s" : ""}</div>}
                  <button type="button" className="gov-btn-view-detail">View Details →</button>
                </div>
              ))}
            </div>
          )}
          {pages > 1 && (
            <div className="gov-pagination">
              <button type="button" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load({ page: p }); }}>← Prev</button>
              <span>Page {page} of {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); load({ page: p }); }}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ stats, setActiveTab }) {
  if (!stats) return <div className="gov-loading">Loading overview…</div>;
  return (
    <div className="gov-overview">
      <div className="gov-jurisdiction-banner">
        <span className="gov-jurisdiction-level">{stats.governmentLevel?.toUpperCase()} GOVERNMENT</span>
        <h2>Monitoring: {stats.jurisdiction}</h2>
        {stats.department && <p>Department: {stats.department}</p>}
      </div>

      <div className="gov-stats-grid">
        <div className="gov-stat-card">
          <div className="gov-stat-number">{stats.totalProblemsInArea}</div>
          <div className="gov-stat-label">Problems in Area</div>
        </div>
        <div className="gov-stat-card gov-stat-active">
          <div className="gov-stat-number">{stats.activeProjects}</div>
          <div className="gov-stat-label">Active Projects</div>
        </div>
        <div className="gov-stat-card gov-stat-done">
          <div className="gov-stat-number">{stats.completedProjects}</div>
          <div className="gov-stat-label">Completed</div>
        </div>
        <div className="gov-stat-card gov-stat-delay">
          <div className="gov-stat-number">{stats.delayedMilestones}</div>
          <div className="gov-stat-label">Delayed Milestones</div>
        </div>
        <div className="gov-stat-card gov-stat-submitted">
          <div className="gov-stat-number">{stats.mySubmissions}</div>
          <div className="gov-stat-label">My Submissions</div>
        </div>
      </div>

      <div className="gov-quick-actions">
        <h3>Quick Actions</h3>
        <div className="gov-quick-grid">
          <button type="button" onClick={() => setActiveTab("report")} className="gov-quick-btn">
            <span>📝</span><strong>Report a Problem</strong><small>Submit a civic issue for resolution</small>
          </button>
          <button type="button" onClick={() => setActiveTab("track")} className="gov-quick-btn">
            <span>📋</span><strong>Track My Problems</strong><small>Follow your submitted problems</small>
          </button>
          <button type="button" onClick={() => setActiveTab("monitor")} className="gov-quick-btn">
            <span>📊</span><strong>Monitor Projects</strong><small>View all projects in your jurisdiction</small>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Government Dashboard ─────────────────────────────────────────────────

function GovernmentDashboard() {
  const [preferences, updatePreferences] = usePreferences();
  const [activeTab, setActiveTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [, setDomainsLoaded] = useState(false);

  let user = {};
  try { user = JSON.parse(sessionStorage.getItem("jansamadhanUser") || "{}"); } catch (_) {}

  useEffect(() => {
    (async () => {
      try {
        const data = await authenticatedRequest("/government/stats");
        setStats(data);
      } catch (err) { setStatsError(err.message || "Failed to load dashboard stats."); }
    })();
  }, []);

  useEffect(() => {
    getDomains()
      .then((domains) => {
        DOMAIN_OPTIONS = domains;
        setDomainsLoaded(true);
      })
      .catch(() => setDomainsLoaded(true));
  }, []);

  const handleReportSubmitted = () => {
    setReportSubmitted(true);
    setActiveTab("track");
    // Refresh stats
    authenticatedRequest("/government/stats").then(setStats).catch(() => {});
  };

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "report", label: "Report a Problem" },
    { id: "track", label: "Track My Problems" },
    { id: "general", label: "General Problems" },
    { id: "monitor", label: "Monitor Projects" },
  ];

  return (
    <div className={`gov-dashboard gov-theme-${preferences.theme}`}>
      <UtilityBar preferences={preferences} updatePreferences={updatePreferences} />

      <header className="gov-header">
        <Link to="/" aria-label="JanSamadhan home">
          <img src={lightLogo} alt="JanSamadhan" />
        </Link>
        <div className="gov-header-title">
          <span>🏛️ Government Portal</span>
          <small>{stats?.jurisdiction || (user.districtName ? `${user.districtName} District` : "Loading…")}</small>
        </div>
        <Link to="/" className="gov-back-link">← Back to Home</Link>
      </header>

      <div className="gov-tab-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`gov-tab-btn ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => { setActiveTab(tab.id); setReportSubmitted(false); }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="gov-main">
        {statsError && <div className="gov-error-block" role="alert">{statsError}</div>}

        {reportSubmitted && activeTab !== "report" && (
          <div className="gov-success-banner" role="alert">
            ✅ Problem submitted successfully! You can track it below.
          </div>
        )}

        {activeTab === "overview" && <OverviewTab stats={stats} setActiveTab={setActiveTab} />}
        {activeTab === "report" && <ReportProblemTab user={user} onSubmitted={handleReportSubmitted} />}
        {activeTab === "track" && <TrackMyProblemsTab key={reportSubmitted ? "refreshed" : "initial"} />}
        {activeTab === "general" && <GeneralProblemsTab />}
        {activeTab === "monitor" && <MonitorProjectsTab />}
      </main>
    </div>
  );
}

export default GovernmentDashboard;
