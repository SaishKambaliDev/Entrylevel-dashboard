import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import lightLogo from "./assets/logoli.png";
import darkLogo from "./assets/logoda.png";
import UtilityBar from "./UtilityBar";
import { usePreferences, getCurrentUser } from "./usePreferences";
import { authenticatedRequest } from "./api/referenceData";
import "./IndustryDashboard.css";

const CAPABILITIES = [
  { id: "FUNDING", label: "Funding & Financial Grants" },
  { id: "PROTOTYPE_DEVELOPMENT", label: "Prototype Development" },
  { id: "TECHNICAL_EXPERTISE", label: "Technical & Engineering Expertise" },
  { id: "RESEARCH_SUPPORT", label: "R&D / Research Support" },
  { id: "TESTING", label: "Testing & Validation Lab" },
  { id: "INFRASTRUCTURE", label: "Infrastructure & Lab Facilities" },
  { id: "EQUIPMENT_RESOURCES", label: "Equipment & Raw Materials" },
  { id: "INDUSTRY_MENTORSHIP", label: "Industry Mentorship" },
  { id: "IMPLEMENTATION_SUPPORT", label: "Ground Implementation Support" },
  { id: "DEPLOYMENT_SUPPORT", label: "Commercialization / Deployment" },
  { id: "OTHER", label: "Other Support" },
];

function formatDate(dateString) {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function IndustryDashboard() {
  const navigate = useNavigate();
  const [preferences, updatePreferences] = usePreferences();
  const user = getCurrentUser();

  const [activeTab, setActiveTab] = useState("overview"); // overview, heis, collaborations, active, domains, profile
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState({ type: "", message: "" });

  // Data states
  const [overview, setOverview] = useState(null);
  const [heis, setHeis] = useState([]);
  const [filteredHeis, setFilteredHeis] = useState([]);
  const [heiSearch, setHeiSearch] = useState("");
  const [heiDomainFilter, setHeiDomainFilter] = useState("");
  const [collaborations, setCollaborations] = useState([]);
  const [collabFilter, setCollabFilter] = useState("ALL");
  const [selectedCollab, setSelectedCollab] = useState(null);
  const [domainConfig, setDomainConfig] = useState({ allDomains: [], selectedDomains: [], organization: {} });
  const [mentors, setMentors] = useState([]);

  // Modals
  const [heiModal, setHeiModal] = useState({ open: false, hei: null, projects: [] });
  const [requestModal, setRequestModal] = useState({
    open: false,
    project: null,
    hei: null,
    message: "",
    capabilities: [],
  });
  const [supportModal, setSupportModal] = useState({
    open: false,
    collab: null,
    fundingAmount: 0,
    fundingDescription: "",
    prototype: "",
    technical: "",
    research: "",
    testing: "",
    mentorId: "",
    mentorNotes: "",
    implementation: "",
    other: "",
  });

  const isIndustryAdmin = user?.role === "INDUSTRY_ADMIN";

  useEffect(() => {
    loadTab(activeTab);
  }, [activeTab]);

  const loadTab = async (tab) => {
    setLoading(true);
    setNotice({ type: "", message: "" });
    try {
      if (tab === "overview") {
        const data = await authenticatedRequest("/industry/overview");
        setOverview(data);
      } else if (tab === "heis") {
        const data = await authenticatedRequest("/industry/heis");
        setHeis(data);
        setFilteredHeis(data);
      } else if (tab === "collaborations") {
        const data = await authenticatedRequest("/industry/collaborations");
        setCollaborations(data);
      } else if (tab === "active") {
        const data = await authenticatedRequest("/industry/collaborations?status=ACTIVE");
        const approved = await authenticatedRequest("/industry/collaborations?status=APPROVED");
        const combined = [...data, ...approved];
        setCollaborations(combined);
        if (combined.length > 0 && !selectedCollab) {
          loadCollabDetails(combined[0]._id);
        }
      } else if (tab === "domains" || tab === "profile") {
        const data = await authenticatedRequest("/industry/domains");
        setDomainConfig(data);
        const mentorList = await authenticatedRequest("/industry/mentors");
        setMentors(mentorList);
      }
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to load information." });
    } finally {
      setLoading(false);
    }
  };

  // Filter HEIs
  useEffect(() => {
    let result = heis;
    if (heiSearch.trim()) {
      const q = heiSearch.toLowerCase();
      result = result.filter(
        (h) => h.institutionName.toLowerCase().includes(q) || h.district?.toLowerCase().includes(q)
      );
    }
    if (heiDomainFilter) {
      result = result.filter((h) => (h.domains || []).includes(heiDomainFilter));
    }
    setFilteredHeis(result);
  }, [heiSearch, heiDomainFilter, heis]);

  const openHeiDetails = async (hei) => {
    setActionLoading(true);
    try {
      const projects = await authenticatedRequest(`/industry/heis/${hei._id}/projects`);
      setHeiModal({ open: true, hei, projects });
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to load HEI projects." });
    } finally {
      setActionLoading(false);
    }
  };

  const openRequestModal = (project, hei) => {
    setRequestModal({
      open: true,
      project,
      hei,
      message: "",
      capabilities: ["TECHNICAL_EXPERTISE", "INDUSTRY_MENTORSHIP"],
    });
  };

  const toggleCapability = (capId) => {
    setRequestModal((prev) => {
      const exists = prev.capabilities.includes(capId);
      return {
        ...prev,
        capabilities: exists ? prev.capabilities.filter((c) => c !== capId) : [...prev.capabilities, capId],
      };
    });
  };

  const handleSendCollaborationRequest = async (e) => {
    e.preventDefault();
    if (requestModal.capabilities.length === 0) {
      setNotice({ type: "error", message: "Please select at least one capability." });
      return;
    }

    setActionLoading(true);
    setNotice({ type: "", message: "" });
    try {
      await authenticatedRequest("/industry/collaborations", {
        method: "POST",
        body: JSON.stringify({
          institutionId: requestModal.hei._id,
          projectId: requestModal.project._id,
          problemId: requestModal.project.problem?._id,
          message: requestModal.message,
          requestedCapabilities: requestModal.capabilities,
        }),
      });

      setNotice({
        type: "success",
        message: "Collaboration request submitted! Awaiting review and approval from the HEI.",
      });
      setRequestModal({ open: false, project: null, hei: null, message: "", capabilities: [] });
      if (heiModal.open) {
        // Refresh project state in modal
        const refreshed = await authenticatedRequest(`/industry/heis/${heiModal.hei._id}/projects`);
        setHeiModal((prev) => ({ ...prev, projects: refreshed }));
      }
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to send collaboration request." });
    } finally {
      setActionLoading(false);
    }
  };

  const loadCollabDetails = async (collabId) => {
    setActionLoading(true);
    try {
      const data = await authenticatedRequest(`/industry/collaborations/${collabId}`);
      setSelectedCollab(data);
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to load collaboration details." });
    } finally {
      setActionLoading(false);
    }
  };

  const openSupportModal = async (collab) => {
    try {
      const mentorList = await authenticatedRequest("/industry/mentors");
      setMentors(mentorList);
    } catch (_) {}

    const comm = collab.supportCommitments || {};
    setSupportModal({
      open: true,
      collab,
      fundingAmount: comm.funding?.amount || 0,
      fundingDescription: comm.funding?.description || "",
      prototype: comm.prototype || "",
      technical: comm.technical || "",
      research: comm.research || "",
      testing: comm.testing || "",
      mentorId: comm.mentorship?.mentorId?._id || comm.mentorship?.mentorId || "",
      mentorNotes: comm.mentorship?.notes || "",
      implementation: comm.implementation || "",
      other: comm.other || "",
    });
  };

  const handleSaveSupport = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setNotice({ type: "", message: "" });
    try {
      await authenticatedRequest(`/industry/collaborations/${supportModal.collab._id}/support`, {
        method: "PUT",
        body: JSON.stringify({
          funding: {
            amount: supportModal.fundingAmount,
            description: supportModal.fundingDescription,
          },
          prototype: supportModal.prototype,
          technical: supportModal.technical,
          research: supportModal.research,
          testing: supportModal.testing,
          mentorship: {
            mentorId: supportModal.mentorId || undefined,
            notes: supportModal.mentorNotes,
          },
          implementation: supportModal.implementation,
          other: supportModal.other,
        }),
      });

      setNotice({ type: "success", message: "Support commitments saved successfully! Collaboration is active." });
      setSupportModal((prev) => ({ ...prev, open: false }));
      loadTab(activeTab);
      if (selectedCollab) {
        loadCollabDetails(selectedCollab.collaboration._id);
      }
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to update support commitments." });
    } finally {
      setActionLoading(false);
    }
  };

  const toggleDomain = (domainId) => {
    if (!isIndustryAdmin) return;
    setDomainConfig((prev) => {
      const exists = prev.selectedDomains.includes(domainId);
      const updated = exists
        ? prev.selectedDomains.filter((d) => d !== domainId)
        : [...prev.selectedDomains, domainId];
      return { ...prev, selectedDomains: updated };
    });
  };

  const handleSaveDomains = async () => {
    setActionLoading(true);
    setNotice({ type: "", message: "" });
    try {
      await authenticatedRequest("/industry/domains", {
        method: "PUT",
        body: JSON.stringify({ domains: domainConfig.selectedDomains }),
      });
      setNotice({ type: "success", message: "Domain expertise preferences updated successfully." });
    } catch (err) {
      setNotice({ type: "error", message: err.message || "Failed to update domains." });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredCollaborations = collaborations.filter((c) => {
    if (collabFilter === "ALL") return true;
    return c.status === collabFilter;
  });

  return (
    <div className={`industry-dashboard theme-${preferences.theme}`}>
      <UtilityBar preferences={preferences} updatePreferences={updatePreferences} />

      {/* Header */}
      <header className="industry-header">
        <div className="industry-header-left">
          <Link to="/">
            <img
              src={preferences.theme === "light" ? lightLogo : darkLogo}
              alt="JanSamadhan"
              className="industry-logo"
            />
          </Link>
          <div className="industry-title-wrap">
            <h1>Industry & CSR Portal</h1>
            <p>{user?.organizationName || "Industry Organization"} · Government of Jharkhand</p>
          </div>
        </div>
        <div className="industry-header-right">
          <span className="industry-role-badge">
            {isIndustryAdmin ? "🏢 Industry Admin" : "💼 Industry Mentor"}
          </span>
          <Link to="/" className="industry-btn industry-btn-secondary" style={{ fontSize: "0.82rem" }}>
            Back to Home
          </Link>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="industry-nav-bar" aria-label="Industry tabs">
        <button
          className={`industry-tab-btn ${activeTab === "overview" ? "is-active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          📊 Overview
        </button>
        <button
          className={`industry-tab-btn ${activeTab === "heis" ? "is-active" : ""}`}
          onClick={() => setActiveTab("heis")}
        >
          🏛 Explore HEIs
          {heis.length > 0 && <span className="industry-tab-badge">{heis.length}</span>}
        </button>
        <button
          className={`industry-tab-btn ${activeTab === "collaborations" ? "is-active" : ""}`}
          onClick={() => setActiveTab("collaborations")}
        >
          🤝 Collaborations
          {collaborations.length > 0 && <span className="industry-tab-badge">{collaborations.length}</span>}
        </button>
        <button
          className={`industry-tab-btn ${activeTab === "active" ? "is-active" : ""}`}
          onClick={() => setActiveTab("active")}
        >
          🚀 Active Projects & Support
        </button>
        <button
          className={`industry-tab-btn ${activeTab === "domains" ? "is-active" : ""}`}
          onClick={() => setActiveTab("domains")}
        >
          🎯 Domain Expertise
        </button>
        <button
          className={`industry-tab-btn ${activeTab === "profile" ? "is-active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          🏢 Organization Profile
        </button>
      </nav>

      {/* Main Content */}
      <main className="industry-main-content">
        {notice.message && (
          <div className={`industry-notice ${notice.type}`} role="status">
            <span>{notice.message}</span>
            <button
              onClick={() => setNotice({ type: "", message: "" })}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem" }}
            >
              ×
            </button>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div>
            <div className="industry-stats-grid">
              <div className="industry-stat-card">
                <h3>Matching HEIs</h3>
                <p className="industry-stat-number">{overview?.matchingHeisCount ?? "—"}</p>
                <p className="industry-stat-desc">Institutions matching your domains</p>
              </div>
              <div className="industry-stat-card">
                <h3>Active Collaborations</h3>
                <p className="industry-stat-number">{overview?.activeCollaborations ?? 0}</p>
                <p className="industry-stat-desc">Approved projects currently supported</p>
              </div>
              <div className="industry-stat-card">
                <h3>Pending Requests</h3>
                <p className="industry-stat-number">{overview?.pendingRequests ?? 0}</p>
                <p className="industry-stat-desc">Awaiting approval from HEIs</p>
              </div>
              <div className="industry-stat-card">
                <h3>Total Requests Sent</h3>
                <p className="industry-stat-number">{overview?.totalCollaborations ?? 0}</p>
                <p className="industry-stat-desc">Across all civic innovation initiatives</p>
              </div>
            </div>

            <div className="industry-section-card">
              <h2>Quick Actions</h2>
              <p className="subtitle">Connect with academic institutions solving Jharkhand's grassroots challenges.</p>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <button className="industry-btn industry-btn-primary" onClick={() => setActiveTab("heis")}>
                  🔍 Discover Higher Education Institutions
                </button>
                <button className="industry-btn industry-btn-secondary" onClick={() => setActiveTab("domains")}>
                  🎯 Configure Domain Expertise
                </button>
                <button className="industry-btn industry-btn-secondary" onClick={() => setActiveTab("collaborations")}>
                  📋 View Collaboration Requests
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: EXPLORE HEIs */}
        {activeTab === "heis" && (
          <div className="industry-section-card">
            <h2>Explore Higher Education Institutions</h2>
            <p className="subtitle">
              Institutions are prioritized based on domain overlap with your organization's selected expertise.
            </p>

            <div className="industry-toolbar">
              <input
                type="text"
                className="industry-input"
                style={{ flex: 1, minWidth: "240px" }}
                placeholder="Search by institution name or district..."
                value={heiSearch}
                onChange={(e) => setHeiSearch(e.target.value)}
              />
              <select
                className="industry-select"
                value={heiDomainFilter}
                onChange={(e) => setHeiDomainFilter(e.target.value)}
              >
                <option value="">All Domains</option>
                {domainConfig.allDomains?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <p style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>Loading institutions...</p>
            ) : filteredHeis.length === 0 ? (
              <div className="industry-empty-state">
                <h4>No matching HEIs found</h4>
                <p>Try adjusting your search criteria or configure your domain expertise.</p>
                <button className="industry-btn industry-btn-secondary" onClick={() => setActiveTab("domains")}>
                  Update Domains
                </button>
              </div>
            ) : (
              <div className="industry-heis-grid">
                {filteredHeis.map((hei) => (
                  <div key={hei._id} className="industry-hei-card">
                    <div>
                      <div className="industry-hei-header">
                        <div>
                          <h3 className="industry-hei-title">{hei.institutionName}</h3>
                          <small style={{ color: "var(--text-muted)" }}>
                            {hei.institutionType} · {hei.district}
                          </small>
                        </div>
                        {hei.matchingDomainsCount > 0 && (
                          <span className="industry-badge overlap">
                            ⭐ {hei.matchingDomainsCount} domain{hei.matchingDomainsCount > 1 ? "s" : ""} match
                          </span>
                        )}
                      </div>

                      <div className="industry-domain-chips">
                        {(hei.domains || []).slice(0, 4).map((d) => {
                          const isMatch = hei.matchingDomains?.includes(d);
                          return (
                            <span key={d} className={`industry-chip ${isMatch ? "matched" : ""}`}>
                              {d.replaceAll("_", " ")}
                            </span>
                          );
                        })}
                        {(hei.domains || []).length > 4 && (
                          <span className="industry-chip">+{hei.domains.length - 4} more</span>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: "1rem", paddingTop: "0.85rem", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                        <strong>{hei.activeProjectsCount}</strong> active project{hei.activeProjectsCount === 1 ? "" : "s"}
                      </span>
                      <button
                        className="industry-btn industry-btn-primary"
                        style={{ fontSize: "0.82rem", padding: "0.45rem 0.85rem" }}
                        onClick={() => openHeiDetails(hei)}
                      >
                        View Projects →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: COLLABORATIONS */}
        {activeTab === "collaborations" && (
          <div className="industry-section-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h2>Collaboration Requests</h2>
                <p className="subtitle" style={{ margin: 0 }}>
                  Track all collaboration proposals sent to Higher Education Institutions.
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                {["ALL", "PENDING", "APPROVED", "ACTIVE", "REJECTED"].map((st) => (
                  <button
                    key={st}
                    className={`industry-btn ${collabFilter === st ? "industry-btn-primary" : "industry-btn-secondary"}`}
                    style={{ fontSize: "0.78rem", padding: "0.35rem 0.75rem" }}
                    onClick={() => setCollabFilter(st)}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p style={{ textAlign: "center", padding: "2rem" }}>Loading collaborations...</p>
            ) : filteredCollaborations.length === 0 ? (
              <div className="industry-empty-state">
                <h4>No collaboration requests found</h4>
                <p>Discover HEIs and propose partnerships to support student-led civic solutions.</p>
                <button className="industry-btn industry-btn-primary" onClick={() => setActiveTab("heis")}>
                  Explore HEIs
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {filteredCollaborations.map((collab) => {
                  const statusClass = `status-${collab.status.toLowerCase()}`;
                  return (
                    <div
                      key={collab._id}
                      style={{
                        padding: "1.25rem",
                        border: "1px solid var(--border)",
                        borderRadius: "10px",
                        background: "var(--surface)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.3rem" }}>
                            <span className={`industry-badge ${statusClass}`}>{collab.status}</span>
                            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                              Requested on {formatDate(collab.createdAt)}
                            </span>
                          </div>
                          <h3 style={{ margin: "0.2rem 0", fontSize: "1.1rem" }}>
                            {collab.projectId?.title || collab.problemId?.title || "Civic Project"}
                          </h3>
                          <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                            Institution: <strong>{collab.institutionId?.institutionName}</strong>
                          </p>
                        </div>

                        <div>
                          {["APPROVED", "ACTIVE"].includes(collab.status) && (
                            <button
                              className="industry-btn industry-btn-primary"
                              style={{ fontSize: "0.82rem" }}
                              onClick={() => {
                                setActiveTab("active");
                                loadCollabDetails(collab._id);
                              }}
                            >
                              Manage Support & Progress →
                            </button>
                          )}
                        </div>
                      </div>

                      {collab.message && (
                        <p style={{ margin: "0.5rem 0", fontSize: "0.85rem", background: "var(--surface-alt)", padding: "0.6rem 0.8rem", borderRadius: "6px" }}>
                          <em>&ldquo;{collab.message}&rdquo;</em>
                        </p>
                      )}

                      <div style={{ marginTop: "0.5rem" }}>
                        <small style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>
                          Capabilities Offered:
                        </small>
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          {(collab.capabilitiesOffered || []).map((c) => (
                            <span key={c} className="industry-chip matched">
                              {c.replaceAll("_", " ")}
                            </span>
                          ))}
                        </div>
                      </div>

                      {collab.status === "PENDING" && (
                        <p style={{ margin: "0.75rem 0 0", fontSize: "0.82rem", color: "#b45309" }}>
                          ⏳ Awaiting HEI review. The institution will inspect your capabilities and approve or decline the collaboration request.
                        </p>
                      )}

                      {collab.status === "REJECTED" && (
                        <p style={{ margin: "0.75rem 0 0", fontSize: "0.82rem", color: "#b91c1c" }}>
                          ❌ Rejected by HEI: {collab.rejectionReason || "No specific reason provided."}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ACTIVE PROJECTS & COMMITMENTS */}
        {activeTab === "active" && (
          <div style={{ display: "grid", gridTemplateColumns: selectedCollab ? "340px 1fr" : "1fr", gap: "1.5rem" }}>
            <div className="industry-section-card" style={{ marginBottom: 0 }}>
              <h2>Active Collaborations</h2>
              <p className="subtitle">Select a project to inspect progress and update support.</p>

              {collaborations.filter((c) => ["APPROVED", "ACTIVE"].includes(c.status)).length === 0 ? (
                <div className="industry-empty-state">
                  <h4>No active collaborations yet</h4>
                  <p>Collaborations appear here once approved by the HEI.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {collaborations
                    .filter((c) => ["APPROVED", "ACTIVE"].includes(c.status))
                    .map((c) => {
                      const isSelected = selectedCollab?.collaboration?._id === c._id;
                      return (
                        <div
                          key={c._id}
                          onClick={() => loadCollabDetails(c._id)}
                          style={{
                            padding: "1rem",
                            borderRadius: "8px",
                            border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                            background: isSelected ? "var(--surface-alt)" : "var(--surface)",
                            cursor: "pointer",
                          }}
                        >
                          <span className="industry-badge status-active">{c.status}</span>
                          <h4 style={{ margin: "0.4rem 0 0.2rem", fontSize: "0.95rem" }}>
                            {c.projectId?.title || "Civic Project"}
                          </h4>
                          <small style={{ color: "var(--text-muted)" }}>{c.institutionId?.institutionName}</small>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {selectedCollab && (
              <div className="industry-section-card" style={{ marginBottom: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                  <div>
                    <span className="industry-badge status-active">{selectedCollab.collaboration.status}</span>
                    <h2 style={{ marginTop: "0.4rem" }}>{selectedCollab.collaboration.projectId?.title}</h2>
                    <p style={{ color: "var(--text-muted)", margin: "0 0 1rem" }}>
                      HEI: <strong>{selectedCollab.collaboration.institutionId?.institutionName}</strong>
                    </p>
                  </div>
                  <button
                    className="industry-btn industry-btn-primary"
                    onClick={() => openSupportModal(selectedCollab.collaboration)}
                  >
                    ✏️ Update Commitments & Support
                  </button>
                </div>

                {/* Proposed Solution info */}
                {selectedCollab.collaboration.projectId?.proposedSolution && (
                  <div style={{ background: "var(--surface-alt)", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem" }}>
                    <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem" }}>💡 HEI Proposed Solution:</h4>
                    <p style={{ margin: "0 0 0.4rem", fontSize: "0.88rem" }}>
                      <strong>Approach:</strong> {selectedCollab.collaboration.projectId.proposedSolution.approach || "In development"}
                    </p>
                    <p style={{ margin: "0 0 0.4rem", fontSize: "0.88rem" }}>
                      <strong>Required Resources:</strong> {selectedCollab.collaboration.projectId.proposedSolution.requiredResources || "N/A"}
                    </p>
                    <p style={{ margin: "0", fontSize: "0.88rem" }}>
                      <strong>Expected Timeline:</strong> {selectedCollab.collaboration.projectId.proposedSolution.expectedTimeline || "N/A"}
                    </p>
                  </div>
                )}

                {/* Recorded Commitments */}
                <h3 style={{ fontSize: "1.05rem", margin: "1.25rem 0 0.75rem" }}>Recorded Support Commitments:</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                  <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px" }}>
                    <small style={{ color: "var(--text-muted)", textTransform: "uppercase" }}>Grant / Funding</small>
                    <p style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0.25rem 0" }}>
                      {selectedCollab.collaboration.supportCommitments?.funding?.amount > 0
                        ? `₹ ${selectedCollab.collaboration.supportCommitments.funding.amount.toLocaleString("en-IN")}`
                        : "None recorded"}
                    </p>
                    <small style={{ color: "var(--text-muted)" }}>
                      {selectedCollab.collaboration.supportCommitments?.funding?.description || "No funding notes"}
                    </small>
                  </div>

                  <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px" }}>
                    <small style={{ color: "var(--text-muted)", textTransform: "uppercase" }}>Assigned Mentor</small>
                    <p style={{ fontSize: "1rem", fontWeight: 600, margin: "0.25rem 0" }}>
                      {selectedCollab.collaboration.supportCommitments?.mentorship?.mentorId?.name || "No mentor assigned"}
                    </p>
                    <small style={{ color: "var(--text-muted)" }}>
                      {selectedCollab.collaboration.supportCommitments?.mentorship?.notes || "No mentor notes"}
                    </small>
                  </div>

                  <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px" }}>
                    <small style={{ color: "var(--text-muted)", textTransform: "uppercase" }}>Technical / Testing</small>
                    <p style={{ fontSize: "0.88rem", margin: "0.25rem 0" }}>
                      {selectedCollab.collaboration.supportCommitments?.technical ||
                        selectedCollab.collaboration.supportCommitments?.testing ||
                        "No technical notes recorded"}
                    </p>
                  </div>
                </div>

                {/* Real-time Project Milestones */}
                <h3 style={{ fontSize: "1.05rem", margin: "1.5rem 0 0.75rem" }}>Project Milestones & Live Progress:</h3>
                {selectedCollab.milestones?.length === 0 ? (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>The HEI has not added milestones yet.</p>
                ) : (
                  <div className="industry-timeline">
                    {selectedCollab.milestones.map((m, idx) => {
                      const isDone = m.status === "COMPLETED";
                      return (
                        <div key={m._id || idx} className={`industry-timeline-step ${isDone ? "completed" : "active"}`}>
                          <div className="industry-timeline-bullet" />
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <h4 style={{ margin: "0 0 0.2rem", fontSize: "0.95rem" }}>{m.title}</h4>
                              <span className={`industry-badge ${isDone ? "status-approved" : "status-pending"}`}>
                                {m.status} ({m.completionPercentage || 0}%)
                              </span>
                            </div>
                            <p style={{ margin: "0.2rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                              {m.description}
                            </p>
                            <small style={{ color: "var(--text-muted)" }}>
                              Expected Completion: {formatDate(m.expectedCompletionDate)}
                            </small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: DOMAIN EXPERTISE */}
        {activeTab === "domains" && (
          <div className="industry-section-card">
            <h2>Domain Expertise & Capability Areas</h2>
            <p className="subtitle">
              Select the civic and technical areas where your organization can provide mentorship, prototypes,
              funding, or facilities.
            </p>

            {!isIndustryAdmin && (
              <div className="industry-notice" style={{ background: "#ede9fe", color: "#6d28d9", border: "1px solid #ddd6fe" }}>
                ℹ️ You are logged in as an <strong>Industry Mentor</strong>. Only an Industry Admin can update organization domain preferences.
              </div>
            )}

            <div className="industry-domain-grid">
              {domainConfig.allDomains?.map((domain) => {
                const isChecked = domainConfig.selectedDomains?.includes(domain.id);
                return (
                  <label key={domain.id} className="industry-domain-label">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!isIndustryAdmin}
                      onChange={() => toggleDomain(domain.id)}
                    />
                    <span>{domain.name}</span>
                  </label>
                );
              })}
            </div>

            {isIndustryAdmin && (
              <button
                className="industry-btn industry-btn-primary"
                onClick={handleSaveDomains}
                disabled={actionLoading}
              >
                {actionLoading ? "Saving..." : "Save Domain Expertise"}
              </button>
            )}
          </div>
        )}

        {/* TAB 6: PROFILE */}
        {activeTab === "profile" && (
          <div className="industry-section-card">
            <h2>Industry Organization Profile</h2>
            <p className="subtitle">Details registered with the JanSamadhan civic network.</p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem", marginBottom: "1.5rem" }}>
              <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px" }}>
                <small style={{ color: "var(--text-muted)" }}>Organization Name</small>
                <p style={{ fontWeight: 600, margin: "0.2rem 0" }}>{domainConfig.organization?.organizationName || user?.organizationName}</p>
              </div>
              <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px" }}>
                <small style={{ color: "var(--text-muted)" }}>Organization Type</small>
                <p style={{ fontWeight: 600, margin: "0.2rem 0" }}>{domainConfig.organization?.organizationType || "Enterprise / Startup"}</p>
              </div>
              <div style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px" }}>
                <small style={{ color: "var(--text-muted)" }}>District & State</small>
                <p style={{ fontWeight: 600, margin: "0.2rem 0" }}>{domainConfig.organization?.district || "Jharkhand"}, {domainConfig.organization?.state || "Jharkhand"}</p>
              </div>
            </div>

            <h3 style={{ fontSize: "1.05rem", margin: "1.5rem 0 0.75rem" }}>Organization Team Members:</h3>
            <div style={{ display: "grid", gap: "0.6rem" }}>
              {mentors.map((m) => (
                <div key={m._id} style={{ display: "flex", justifyContent: "space-between", padding: "0.75rem 1rem", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--surface)" }}>
                  <div>
                    <strong>{m.name}</strong> <small style={{ color: "var(--text-muted)" }}>({m.email})</small>
                  </div>
                  <span className="industry-badge overlap">{m.role?.replaceAll("_", " ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: HEI DETAILS & ACTIVE PROJECTS */}
      {heiModal.open && (
        <div className="industry-modal-backdrop" onClick={() => setHeiModal({ open: false, hei: null, projects: [] })}>
          <div className="industry-modal" onClick={(e) => e.stopPropagation()}>
            <div className="industry-modal-header">
              <div>
                <h3>{heiModal.hei?.institutionName}</h3>
                <small style={{ color: "var(--text-muted)" }}>
                  {heiModal.hei?.institutionType} · {heiModal.hei?.district} · AISHE: {heiModal.hei?.aisheCode}
                </small>
              </div>
              <button className="industry-modal-close" onClick={() => setHeiModal({ open: false, hei: null, projects: [] })}>
                ×
              </button>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <small style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.3rem" }}>
                Institution Expertise Domains:
              </small>
              <div className="industry-domain-chips">
                {(heiModal.hei?.domains || []).map((d) => (
                  <span key={d} className="industry-chip matched">
                    {d.replaceAll("_", " ")}
                  </span>
                ))}
              </div>
            </div>

            <h4 style={{ margin: "1.25rem 0 0.75rem" }}>Active Projects Under Development:</h4>
            {heiModal.projects.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No active projects under development at this institution.</p>
            ) : (
              <div style={{ display: "grid", gap: "1rem" }}>
                {heiModal.projects.map((proj) => (
                  <div key={proj._id} style={{ padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--surface)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                      <div>
                        <h4 style={{ margin: "0 0 0.3rem", fontSize: "1rem" }}>{proj.title}</h4>
                        <span className="industry-chip">{proj.problem?.domain?.replaceAll("_", " ") || "CIVIC"}</span>
                      </div>
                      <span className="industry-badge status-active">{proj.status}</span>
                    </div>

                    <p style={{ margin: "0.5rem 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
                      {proj.description || proj.problem?.description}
                    </p>

                    {proj.proposedSolution?.approach && (
                      <p style={{ margin: "0.4rem 0", fontSize: "0.82rem", background: "var(--surface-alt)", padding: "0.4rem 0.6rem", borderRadius: "4px" }}>
                        <strong>Solution Approach:</strong> {proj.proposedSolution.approach}
                      </p>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {proj.milestonesCount} milestone{proj.milestonesCount === 1 ? "" : "s"} ({proj.progressPercentage}% progress)
                      </span>

                      {proj.existingCollaboration ? (
                        <span className="industry-badge status-pending">
                          Request: {proj.existingCollaboration.status}
                        </span>
                      ) : (
                        <button
                          className="industry-btn industry-btn-primary"
                          style={{ fontSize: "0.8rem", padding: "0.4rem 0.8rem" }}
                          onClick={() => openRequestModal(proj, heiModal.hei)}
                        >
                          🤝 Request Collaboration
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: REQUEST COLLABORATION */}
      {requestModal.open && (
        <div className="industry-modal-backdrop" onClick={() => setRequestModal({ open: false, project: null, hei: null, message: "", capabilities: [] })}>
          <div className="industry-modal" onClick={(e) => e.stopPropagation()}>
            <div className="industry-modal-header">
              <div>
                <h3>Request Collaboration with HEI</h3>
                <small style={{ color: "var(--text-muted)" }}>
                  Target: {requestModal.hei?.institutionName} · Project: {requestModal.project?.title}
                </small>
              </div>
              <button className="industry-modal-close" onClick={() => setRequestModal({ open: false, project: null, hei: null, message: "", capabilities: [] })}>
                ×
              </button>
            </div>

            <form onSubmit={handleSendCollaborationRequest}>
              <label style={{ display: "block", fontSize: "0.88rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                Select Capabilities Your Organization Can Provide:
              </label>
              <div className="industry-cap-grid">
                {CAPABILITIES.map((cap) => {
                  const isChecked = requestModal.capabilities.includes(cap.id);
                  return (
                    <label key={cap.id} className="industry-cap-item">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCapability(cap.id)}
                      />
                      <span>{cap.label}</span>
                    </label>
                  );
                })}
              </div>

              <label style={{ display: "block", fontSize: "0.88rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                Collaboration Message / How You Can Help:
              </label>
              <textarea
                className="industry-input"
                style={{ width: "100%", height: "90px", marginBottom: "1.25rem", resize: "vertical" }}
                placeholder="Explain the specific technical assistance, lab equipment, grant funding, or mentorship you can commit..."
                value={requestModal.message}
                onChange={(e) => setRequestModal((prev) => ({ ...prev, message: e.target.value }))}
                required
              />

              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
                ℹ️ Once submitted, the HEI will review your request. Access to commit resources and assign mentors is unlocked after HEI approval.
              </p>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="industry-btn industry-btn-secondary"
                  onClick={() => setRequestModal({ open: false, project: null, hei: null, message: "", capabilities: [] })}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="industry-btn industry-btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Submitting..." : "Submit Collaboration Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: UPDATE SUPPORT COMMITMENTS */}
      {supportModal.open && (
        <div className="industry-modal-backdrop" onClick={() => setSupportModal((prev) => ({ ...prev, open: false }))}>
          <div className="industry-modal" onClick={(e) => e.stopPropagation()}>
            <div className="industry-modal-header">
              <div>
                <h3>Record Support & Commitments</h3>
                <small style={{ color: "var(--text-muted)" }}>
                  Institution: {supportModal.collab?.institutionId?.institutionName} · Project: {supportModal.collab?.projectId?.title}
                </small>
              </div>
              <button className="industry-modal-close" onClick={() => setSupportModal((prev) => ({ ...prev, open: false }))}>
                ×
              </button>
            </div>

            <form onSubmit={handleSaveSupport}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
                    Committed Funding Amount (₹ INR):
                  </label>
                  <input
                    type="number"
                    className="industry-input"
                    style={{ width: "100%" }}
                    placeholder="e.g. 50000"
                    value={supportModal.fundingAmount}
                    onChange={(e) => setSupportModal((prev) => ({ ...prev, fundingAmount: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
                    Assign Industry Mentor:
                  </label>
                  <select
                    className="industry-select"
                    style={{ width: "100%" }}
                    value={supportModal.mentorId}
                    onChange={(e) => setSupportModal((prev) => ({ ...prev, mentorId: e.target.value }))}
                  >
                    <option value="">Select a team member</option>
                    {mentors.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name} ({m.role?.replaceAll("_", " ")})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
                  Funding Purpose / Description:
                </label>
                <input
                  type="text"
                  className="industry-input"
                  style={{ width: "100%" }}
                  placeholder="e.g. Procurement grant for IoT water sensors and filtration units"
                  value={supportModal.fundingDescription}
                  onChange={(e) => setSupportModal((prev) => ({ ...prev, fundingDescription: e.target.value }))}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
                  Technical / Engineering Support Notes:
                </label>
                <textarea
                  className="industry-input"
                  style={{ width: "100%", height: "65px", resize: "vertical" }}
                  placeholder="e.g. Mechanical review of purification chassis, weekly engineering calls"
                  value={supportModal.technical}
                  onChange={(e) => setSupportModal((prev) => ({ ...prev, technical: e.target.value }))}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
                  Testing Facilities / Lab Access:
                </label>
                <input
                  type="text"
                  className="industry-input"
                  style={{ width: "100%" }}
                  placeholder="e.g. Certified lab testing at our Ranchi testing facility"
                  value={supportModal.testing}
                  onChange={(e) => setSupportModal((prev) => ({ ...prev, testing: e.target.value }))}
                />
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
                  Mentor Guidance & Meeting Notes:
                </label>
                <input
                  type="text"
                  className="industry-input"
                  style={{ width: "100%" }}
                  placeholder="e.g. Bi-weekly mentorship on field deployment and safety standards"
                  value={supportModal.mentorNotes}
                  onChange={(e) => setSupportModal((prev) => ({ ...prev, mentorNotes: e.target.value }))}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="industry-btn industry-btn-secondary"
                  onClick={() => setSupportModal((prev) => ({ ...prev, open: false }))}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="industry-btn industry-btn-primary"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Saving..." : "Save Commitments"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default IndustryDashboard;
