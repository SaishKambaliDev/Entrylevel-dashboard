import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import lightLogo from "./assets/logoli.png";
import { authenticatedRequest, getBlocks, getDistricts, getSubdivisions, getUlbs, getVillages } from "./api/referenceData";
import UtilityBar from "./UtilityBar";
import { usePreferences } from "./usePreferences";
import "./ReportProblem.css";

// Mapping (React Leaflet)
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Fix Leaflet's icon paths (Vite-friendly imports)
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl,
});

const MAX_TOTAL_SIZE = 100 * 1024 * 1024;
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]);
const mapBounds = { minLat: 21.9, maxLat: 25.35, minLng: 83.3, maxLng: 87.95 };

const formatSize = (bytes) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const locationLabel = (location) => location ? location.displayName || `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : "Not selected";

/**
 * ManualLocationFallback — Cascading dropdowns with optional pre-selection.
 * When `preselect` is provided (from partial resolution), the corresponding
 * dropdowns are initialised with those IDs and the cascade loads automatically.
 */
function ManualLocationFallback({ location, setLocation, setError, preselect }) {
  const [districts, setDistricts] = useState([]);
  const [subdivisions, setSubdivisions] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [villages, setVillages] = useState([]);
  const [ulbs, setUlbs] = useState([]);

  const [districtId, setDistrictId] = useState(preselect?.districtId || "");
  const [subdivisionId, setSubdivisionId] = useState(preselect?.subdivisionId || "");
  const [blockId, setBlockId] = useState(preselect?.blockId || "");
  const [villageId, setVillageId] = useState("");
  const [ulbId, setUlbId] = useState("");

  // Load districts on mount
  useEffect(() => {
    getDistricts().then(setDistricts).catch((e) => setError(e.message));
  }, [setError]);

  // Load subdivisions, blocks, ULBs when district is set
  useEffect(() => {
    if (!districtId) return;
    Promise.all([getSubdivisions(districtId), getBlocks(districtId), getUlbs(districtId)])
      .then(([s, b, u]) => { setSubdivisions(s); setBlocks(b); setUlbs(u); })
      .catch((e) => setError(e.message));
  }, [districtId, setError]);

  // Load villages when block is set
  useEffect(() => {
    if (!blockId) return;
    getVillages(blockId).then(setVillages).catch((e) => setError(e.message));
  }, [blockId, setError]);

  const selectDistrict = (id) => {
    setDistrictId(id);
    setSubdivisionId(""); setBlockId(""); setVillageId(""); setUlbId("");
    setSubdivisions([]); setBlocks([]); setVillages([]); setUlbs([]);
  };

  const applyVillage = (id) => {
    setVillageId(id);
    const village = villages.find((item) => item._id === id);
    const district = districts.find((item) => item._id === districtId);
    if (village && district) {
      setLocation((current) => ({
        ...current,
        displayName: `${village.name}, ${district.name}`,
        district: district.name,
        geography: { districtId, subdivisionId, blockId, villageId: id, ulbId: null },
      }));
    }
  };

  const applyUlb = (id) => {
    setUlbId(id);
    const ulb = ulbs.find((item) => item._id === id);
    const district = districts.find((item) => item._id === districtId);
    if (ulb && district) {
      setLocation((current) => ({
        ...current,
        displayName: `${ulb.name}, ${district.name}`,
        district: district.name,
        geography: { districtId, subdivisionId: null, blockId: null, villageId: null, ulbId: id },
      }));
    }
  };

  return (
    <div className="manual-location">
      <p><strong>Manual selection</strong> — choose the district, block, and village (or urban local body) where the problem is located.</p>
      <select value={districtId} onChange={(e) => selectDistrict(e.target.value)}>
        <option value="">District</option>
        {districts.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
      </select>
      {districtId && <>
        <select value={subdivisionId} onChange={(e) => { setSubdivisionId(e.target.value); setBlockId(""); setVillageId(""); setUlbId(""); }}>
          <option value="">Subdivision</option>
          {subdivisions.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
        </select>
        <select value={blockId} onChange={(e) => { setBlockId(e.target.value); setVillageId(""); setUlbId(""); }}>
          <option value="">Block</option>
          {blocks.filter((x) => !subdivisionId || x.subdivisionIds.includes(subdivisionId)).map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
        </select>
        <select value={villageId} disabled={!blockId} onChange={(e) => applyVillage(e.target.value)}>
          <option value="">Village</option>
          {villages.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
        </select>
        <p className="manual-or">or, for an urban location</p>
        <select value={ulbId} onChange={(e) => applyUlb(e.target.value)}>
          <option value="">Urban local body</option>
          {ulbs.map((x) => <option key={x._id} value={x._id}>{x.name}</option>)}
        </select>
      </>}
    </div>
  );
}

/**
 * Build a human-readable summary from a resolved geography object.
 * Uses explicit names returned by the backend — never derives names from IDs.
 */
function buildResolvedSummary(geography) {
  if (!geography) return null;
  const parts = [];
  if (geography.ulbName) {
    // Urban: show ULB and, if available, subdivision and district
    parts.push(geography.ulbName);
    if (geography.subdivisionName) parts.push(geography.subdivisionName);
  } else {
    if (geography.villageName) parts.push(geography.villageName);
    if (geography.blockName) parts.push(geography.blockName);
    if (geography.subdivisionName && geography.subdivisionName !== geography.blockName) parts.push(geography.subdivisionName);
  }
  if (geography.districtName) parts.push(geography.districtName);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Build a human-readable summary for a partial resolution.
 */
function buildPartialSummary(partialResolution) {
  if (!partialResolution) return null;
  const parts = [];
  if (partialResolution.blockName) parts.push(partialResolution.blockName);
  else if (partialResolution.subdivisionName) parts.push(partialResolution.subdivisionName);
  if (partialResolution.districtName) parts.push(partialResolution.districtName);
  return parts.length > 0 ? parts.join(", ") : null;
}

function LocationPicker({ location, setLocation, onCoordinates, resolving, resolution, manualFallback, setManualFallback, error, setError }) {
  const [mode, setMode] = useState("map");
  const mapRef = useRef(null);

  const centerLat = (mapBounds.minLat + mapBounds.maxLat) / 2;
  const centerLng = (mapBounds.minLng + mapBounds.maxLng) / 2;

  // Use browser geolocation and forward to parent
  const useCurrentLocation = () => {
    if (!navigator.geolocation) { setError("Your browser does not support location access. Select a point on the map instead."); return; }
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => onCoordinates({ latitude: coords.latitude, longitude: coords.longitude, displayName: "Current device location" }),
      (geoError) => setError(geoError.code === 1 ? "Location permission was denied. Select a point on the map instead." : "We could not determine your location. Try again or select a point on the map."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Internal map component to handle clicks and draggable marker
  function MapSelector() {
    const map = useMapEvents({
      click(e) {
        const { lat, lng } = e.latlng;
        onCoordinates({ latitude: lat, longitude: lng, displayName: "Selected point on map" });
        setError("");
      }
    });

    // Keep external ref to map for flyTo
    mapRef.current = map;
    return null;
  }

  // Handle marker drag end
  const onMarkerDragEnd = (e) => {
    const { lat, lng } = e.target.getLatLng();
    onCoordinates({ latitude: lat, longitude: lng, displayName: "Dragged marker" });
  };

  // Determine what to display in the resolved confirm card
  const resolvedSummary = resolution?.resolved ? buildResolvedSummary(resolution.geography) : null;
  const partialSummary = (!resolution?.resolved && resolution?.partialResolution) ? buildPartialSummary(resolution.partialResolution) : null;

  // Preselect state passed into ManualLocationFallback when partial resolution exists
  const preselectForManual = resolution?.partialResolution
    ? {
        districtId: resolution.partialResolution.districtId || "",
        subdivisionId: resolution.partialResolution.subdivisionId || "",
        blockId: resolution.partialResolution.blockId || "",
      }
    : null;

  return (
    <div className="report-location">
      <div className="location-options">
        <button type="button" className={mode === "map" ? "is-selected" : ""} onClick={() => setMode("map")}>Select on Jharkhand map</button>
        <button type="button" className={mode === "device" ? "is-selected" : ""} onClick={() => { setMode("device"); useCurrentLocation(); }}>Use my current location</button>
      </div>

      <div className="jharkhand-map">
        <MapContainer center={[location?.latitude ?? centerLat, location?.longitude ?? centerLng]} zoom={8} scrollWheelZoom={true} style={{ width: "100%", height: 360, borderRadius: 8 }} whenCreated={(mapInstance) => { mapRef.current = mapInstance; }}>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapSelector />
          {location && typeof location.latitude === "number" && typeof location.longitude === "number" && (
            <Marker position={[location.latitude, location.longitude]} draggable={true} eventHandlers={{ dragend: onMarkerDragEnd }} />
          )}
        </MapContainer>
      </div>

      <p className="location-selected"><strong>Selected coordinates:</strong> {location ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : "Not selected"}</p>

      {resolving && <p className="location-resolving">Resolving administrative location…</p>}

      {/* Fully resolved — show confirm card */}
      {resolution?.resolved && !manualFallback && (
        <div className="location-confirm">
          <strong className="location-confirm-title">Location detected</strong>
          <div className="location-confirm-fields">
            {resolution.geography?.districtName && <span><em>District:</em> {resolution.geography.districtName}</span>}
            {resolution.geography?.subdivisionName && <span><em>Sub-division:</em> {resolution.geography.subdivisionName}</span>}
            {resolution.geography?.blockName && <span><em>Block:</em> {resolution.geography.blockName}</span>}
            {resolution.geography?.villageName && <span><em>Village:</em> {resolution.geography.villageName}</span>}
            {resolution.geography?.ulbName && <span><em>Urban local body:</em> {resolution.geography.ulbName}</span>}
          </div>
          {resolvedSummary && <span className="location-confirm-name">{resolvedSummary}</span>}
          <button type="button" className="change-location" onClick={() => setManualFallback(true)}>Change location / Select manually</button>
        </div>
      )}

      {/* Partial resolution — show what we found and open dropdowns pre-filled */}
      {!resolution?.resolved && resolution?.partialResolution && !manualFallback && (
        <div className="location-confirm location-partial">
          <strong className="location-confirm-title">Partial location detected</strong>
          {partialSummary && <span className="location-confirm-name">{partialSummary}</span>}
          <p className="location-fallback">{resolution.message || "Please select your village to complete the location."}</p>
          <ManualLocationFallback location={location} setLocation={setLocation} setError={setError} preselect={preselectForManual} />
        </div>
      )}

      {/* Full fallback — no partial resolution or user clicked Change Location */}
      {(resolution?.requiresManualFallback && !resolution?.partialResolution && !resolution?.resolved) || manualFallback ? (
        <>
          {resolution?.message && !resolution?.partialResolution && <p className="location-fallback">{resolution.message}</p>}
          <ManualLocationFallback location={location} setLocation={setLocation} setError={setError} preselect={manualFallback ? (resolution?.partialResolution ? preselectForManual : null) : null} />
        </>
      ) : null}

      {error && <p className="report-error" role="alert">{error}</p>}
    </div>
  );
}

function ReportProblem() {
  const navigate = useNavigate();
  const [preferences, updatePreferences] = usePreferences();
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState(null);
  const [locationResolution, setLocationResolution] = useState(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const [manualLocationFallback, setManualLocationFallback] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionKeyRef = useRef(null);

  const recognitionSupported = useMemo(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition), []);
  let user = {};
  try { user = JSON.parse(sessionStorage.getItem("jansamadhanUser") || "{}"); } catch (_error) { /* Protected route handles this. */ }

  const totalSize = attachments.reduce((total, file) => total + file.size, 0);

  const resolveCoordinates = async (coordinates) => {
    setLocation({ ...coordinates });
    setLocationResolution(null);
    setManualLocationFallback(false);
    setResolvingLocation(true);
    setError("");
    try {
      const resolved = await authenticatedRequest("/location/resolve", { method: "POST", body: { latitude: coordinates.latitude, longitude: coordinates.longitude } });
      setLocationResolution(resolved);
      if (resolved.resolved) {
        // Build displayName from explicit fields returned by the backend
        const geo = resolved.geography;
        const displayParts = [];
        if (geo?.ulbName) {
          displayParts.push(geo.ulbName);
          if (geo?.subdivisionName) displayParts.push(geo.subdivisionName);
        } else {
          if (geo?.villageName) displayParts.push(geo.villageName);
          if (geo?.blockName) displayParts.push(geo.blockName);
          if (geo?.subdivisionName && geo?.subdivisionName !== geo?.blockName) displayParts.push(geo.subdivisionName);
        }
        if (geo?.districtName) displayParts.push(geo.districtName);
        const displayName = displayParts.join(", ") || coordinates.displayName;
        setLocation({
          ...coordinates,
          displayName,
          district: geo?.districtName || "",
          geography: {
            districtId: geo?.districtId ?? null,
            // A ULB is a complete urban geography; the API deliberately ignores
            // an optional geocoder subdivision for this branch.
            subdivisionId: geo?.ulbId ? null : (geo?.subdivisionId ?? null),
            blockId: geo?.blockId ?? null,
            villageId: geo?.villageId ?? null,
            ulbId: geo?.ulbId ?? null,
          },
        });
      } else if (!resolved.partialResolution) {
        // No partial data — open full manual fallback
        setManualLocationFallback(true);
      }
      // If partialResolution exists, LocationPicker renders the pre-filled dropdowns inline
    } catch (resolveError) {
      setLocationResolution({ resolved: false, requiresManualFallback: true, message: resolveError.message || "Automatic resolution failed. Please select your location manually." });
      setManualLocationFallback(true);
    } finally {
      setResolvingLocation(false);
    }
  };

  const next = () => {
    if (step === 1 && !description.trim()) { setError("Please describe the problem before continuing."); return; }
    const geography = location?.geography;
    const hasCompleteGeography = Boolean(geography?.districtId && (geography?.ulbId || (geography?.subdivisionId && geography?.blockId && geography?.villageId)));
    if (step === 2 && (!location || !hasCompleteGeography || resolvingLocation)) {
      setError(resolvingLocation ? "Please wait while the location is being resolved." : "Please confirm the resolved location or complete the manual selection before continuing.");
      return;
    }
    setError(""); setStep((current) => current + 1);
  };

  const addFiles = (event) => {
    const incoming = Array.from(event.target.files || []);
    if (incoming.some((file) => !file.size)) { setError("Empty files cannot be attached."); return; }
    if (incoming.some((file) => !acceptedTypes.has(file.type))) { setError("Attach images, videos, PDFs, Word documents, or text files only."); return; }
    if (totalSize + incoming.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_SIZE) { setError("Total attachments must not exceed 100 MB."); return; }
    setAttachments((current) => [...current, ...incoming]); setError(""); event.target.value = "";
  };

  const startVoiceInput = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition(); recognition.continuous = false; recognition.interimResults = false; recognition.lang = "en-IN";
    recognition.onstart = () => setVoiceActive(true);
    recognition.onresult = (event) => { setDescription((current) => `${current}${current ? " " : ""}${event.results[0][0].transcript}`); setError(""); };
    recognition.onerror = () => setError("Voice input could not be completed. You can type your description instead.");
    recognition.onend = () => setVoiceActive(false); recognition.start();
  };

  const submit = async () => {
    setSubmitting(true); setError("");
    try {
      const geography = location?.geography;
      if (!geography?.districtId || !(geography?.ulbId || (geography?.subdivisionId && geography?.blockId && geography?.villageId))) {
        throw new Error("Select a complete village or urban local body location before submitting.");
      }
      const formData = new FormData();
      formData.append("description", description.trim());
      formData.append("location", JSON.stringify(location));
      formData.append("isAnonymous", String(anonymous));
      submissionKeyRef.current ||= crypto.randomUUID();
      formData.append("submissionKey", submissionKeyRef.current);
      attachments.forEach((file) => formData.append("attachments", file));
      await authenticatedRequest("/problems", { method: "POST", body: formData });
      navigate("/track-problems", { replace: true, state: { submitted: true } });
    } catch (submissionError) { setError(submissionError.message || "Unable to submit your problem."); } finally { setSubmitting(false); }
  };

  return (
    <div className={`report-page report-theme-${preferences.theme}`}>
      <UtilityBar preferences={preferences} updatePreferences={updatePreferences} />
      <header className="report-header">
        <Link to="/" aria-label="JanSamadhan home"><img src={lightLogo} alt="JanSamadhan — Initiative by Government of Jharkhand" /></Link>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link to="/track-problems" className="report-back" style={{ textDecoration: "none" }}>Track Problem Status</Link>
          <Link to="/">Back to Main Page</Link>
        </div>
      </header>
      <main className="report-main">
        <section className="report-card">
          <div className="report-progress">
            <span>Step {step} of 5</span>
            <div><i style={{ width: `${step * 20}%` }} /></div>
          </div>
          {step === 1 && <>
            <p className="report-eyebrow">Step 1 · Problem details</p>
            <h1>Describe your problem</h1>
            <p className="report-help">Explain what is happening and anything that would help someone understand it.</p>
            <textarea value={description} maxLength="5000" onChange={(event) => { setDescription(event.target.value); setError(""); }} placeholder="For example: The streetlight near…" />
            <div className="report-under-input">
              <span>{description.length}/5000</span>
              {recognitionSupported && <button type="button" className="voice-button" onClick={startVoiceInput} disabled={voiceActive}>{voiceActive ? "Listening…" : "🎤 Voice Input"}</button>}
            </div>
            <p className="report-help">JanSamadhan AI will identify the appropriate domain after you submit.</p>
          </>}
          {step === 2 && <>
            <p className="report-eyebrow">Step 2 · Problem location</p>
            <h1>Where is the problem?</h1>
            <p className="report-help">Choose the location where this problem exists, not necessarily your home location.</p>
            <LocationPicker location={location} setLocation={setLocation} onCoordinates={resolveCoordinates} resolving={resolvingLocation} resolution={locationResolution} manualFallback={manualLocationFallback} setManualFallback={setManualLocationFallback} error={error} setError={setError} />
          </>}
          {step === 3 && <>
            <p className="report-eyebrow">Step 3 · Attachments</p>
            <h1>Add supporting files</h1>
            <p className="report-help">Images, videos, PDFs, Word documents, and text files are supported. Total limit: 100 MB.</p>
            <label className="attachment-picker">Choose files<input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,application/pdf,.doc,.docx,text/plain,.txt" onChange={addFiles} /></label>
            <p className="attachment-total">{attachments.length} file{attachments.length === 1 ? "" : "s"} · {formatSize(totalSize)} of 100 MB</p>
            <div className="attachment-list">
              {attachments.map((file, index) => (
                <div key={`${file.name}-${index}`}>
                  <span><strong>{file.name}</strong><small>{file.type || "File"} · {formatSize(file.size)}</small></span>
                  <button type="button" onClick={() => setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))}>Remove</button>
                </div>
              ))}
            </div>
          </>}
          {step === 4 && <>
            <p className="report-eyebrow">Step 4 · Reporter details</p>
            <h1>How should you appear?</h1>
            <p className="report-help">Your identity is kept out of the problem-facing record when you submit anonymously.</p>
            <div className="reporter-options">
              <button type="button" className={!anonymous ? "is-selected" : ""} onClick={() => setAnonymous(false)}><strong>Use my profile details</strong><span>{user.name || "Your profile"}{user.email ? ` · ${user.email}` : ""}</span></button>
              <button type="button" className={anonymous ? "is-selected" : ""} onClick={() => setAnonymous(true)}><strong>Submit anonymously</strong><span>Your profile details will not be exposed with this report.</span></button>
            </div>
          </>}
          {step === 5 && <>
            <p className="report-eyebrow">Step 5 · Review</p>
            <h1>Ready to submit?</h1>
            <dl className="review-list">
              <div><dt>Problem</dt><dd>{description}</dd></div>
              <div><dt>Category</dt><dd>Will be classified by AI</dd></div>
              <div><dt>Location</dt><dd>{locationLabel(location)}</dd></div>
              <div><dt>Attachments</dt><dd>{attachments.length} file{attachments.length === 1 ? "" : "s"}</dd></div>
              <div><dt>Reporter</dt><dd>{anonymous ? "Anonymous" : "My profile"}</dd></div>
            </dl>
          </>}
          {error && step !== 2 && <p className="report-error" role="alert">{error}</p>}
          <footer className="report-actions">
            {step > 1 ? <button type="button" className="report-back" onClick={() => { setError(""); setStep((current) => current - 1); }}>Back</button> : <Link to="/" className="report-back">Back to Main Page</Link>}
            {step < 5 ? <button type="button" className="report-next" onClick={next}>Next</button> : <button type="button" className="report-next" disabled={submitting} onClick={submit}>{submitting ? "Submitting…" : "Submit Problem"}</button>}
          </footer>
        </section>
      </main>
    </div>
  );
}

export default ReportProblem;
