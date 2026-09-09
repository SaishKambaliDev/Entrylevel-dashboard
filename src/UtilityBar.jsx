import { useState } from "react";
import { getCurrentUser } from "./usePreferences";
import { authenticatedRequest } from "./api/referenceData";
import "./UtilityBar.css";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
  { value: "sat", label: "ᱥᱟᱱᱛᱟᱲᱤ" },
];

export function setLanguageCookie(lang) {
  if (lang === "en") {
    document.cookie = "googtrans=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "googtrans=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT;domain=" + location.hostname;
  } else {
    document.cookie = "googtrans=/en/" + lang + ";path=/";
    document.cookie = "googtrans=/en/" + lang + ";path=/;domain=" + location.hostname;
  }
}

function readPreferences() {
  try { return JSON.parse(localStorage.getItem("jansamadhanPreferences") || "{}"); } catch (_) { return {}; }
}

export function writePreferences(updates) {
  const current = readPreferences();
  localStorage.setItem("jansamadhanPreferences", JSON.stringify({ ...current, ...updates }));
}

async function saveLanguageForCurrentUser(language) {
  if (!getCurrentUser() || !sessionStorage.getItem("jansamadhanAuthToken")) return;
  const { user } = await authenticatedRequest("/auth/preferences", { method: "PUT", body: { language } });
  sessionStorage.setItem("jansamadhanUser", JSON.stringify(user));
}

function initials(name) {
  return (name || "User").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function ProfileMenu() {
  const [profileOpen, setProfileOpen] = useState(false);
  const user = getCurrentUser();
  if (!user) return null;

  const prefs = readPreferences();
  const currentLang = prefs.language || "en";

  const changeLanguage = async (lang) => {
    writePreferences({ language: lang });
    setLanguageCookie(lang);
    try { await saveLanguageForCurrentUser(lang); } catch (_error) { /* Keep the browser preference if saving is temporarily unavailable. */ }
    window.location.reload();
  };

  const logout = () => {
    sessionStorage.removeItem("jansamadhanAuthToken");
    sessionStorage.removeItem("jansamadhanUser");
    setProfileOpen(false);
    window.location.assign("/");
  };

  const isCitizen = user.role === "CITIZEN";
  const isHei = ["HEI_ADMIN", "FACULTY", "STUDENT"].includes(user.role);
  const isIndustry = ["INDUSTRY_ADMIN", "INDUSTRY_MENTOR"].includes(user.role);
  const isGovernment = user.role === "GOVERNMENT";
  const isAdmin = user.role === "SYSTEM_ADMIN";

  return (
    <div className="site-profile">
      <button className="site-profile-trigger" type="button" aria-label="Open profile and settings" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}>
        {initials(user.name)}
      </button>
      {profileOpen && (
        <div className="site-profile-menu">
          <strong>{user.name}</strong>
          <small>{user.email}</small>
          <span>{user.role?.replaceAll("_", " ")}</span>
          {isCitizen && <a href="/track-problems" style={{ display: "block", padding: "6px 0", color: "#ea580c", textDecoration: "none", fontWeight: 600, fontSize: "0.85rem" }}>📋 Track My Problems</a>}
          {isHei && <a href="/hei" style={{ display: "block", padding: "6px 0", color: "#7c3aed", textDecoration: "none", fontWeight: 600, fontSize: "0.85rem" }}>🏛 HEI Portal</a>}
          {isIndustry && <a href="/industry" style={{ display: "block", padding: "6px 0", color: "#514ce8", textDecoration: "none", fontWeight: 600, fontSize: "0.85rem" }}>🏢 Industry Portal</a>}
          {isGovernment && <a href="/government" style={{ display: "block", padding: "6px 0", color: "#166534", textDecoration: "none", fontWeight: 600, fontSize: "0.85rem" }}>🏛️ Government Portal</a>}
          {isAdmin && <a href="/system-admin" style={{ display: "block", padding: "6px 0", color: "#0284c7", textDecoration: "none", fontWeight: 600, fontSize: "0.85rem" }}>⚙️ System Admin</a>}
          <label>
            Theme
            <select value={prefs.theme || "light"} onChange={(e) => { writePreferences({ theme: e.target.value }); window.location.reload(); }}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Language
            <select value={currentLang} onChange={(e) => changeLanguage(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={logout}>Log out</button>
        </div>
      )}
    </div>
  );
}

function UtilityBar({ preferences, updatePreferences, showProfile = true }) {
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const user = getCurrentUser();
  const currentLang = preferences.language || "en";

  const changeLanguage = async (lang) => {
    updatePreferences({ language: lang });
    writePreferences({ language: lang });
    setLanguageCookie(lang);
    try { await saveLanguageForCurrentUser(lang); } catch (_error) { /* Keep the browser preference if saving is temporarily unavailable. */ }
    window.location.reload();
  };

  return (
    <div className="site-utility-bar">
      <div className="site-language">
        <label htmlFor="utility-lang" className="sr-only">Language</label>
        <select id="utility-lang" value={currentLang} onChange={(e) => changeLanguage(e.target.value)} aria-label="Select language">
          {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>
      <button className="site-utility-button" type="button" onClick={() => setAccessibilityOpen((open) => !open)} aria-expanded={accessibilityOpen}>Accessibility</button>
      <button className="site-utility-button" type="button" onClick={() => updatePreferences({ theme: preferences.theme === "light" ? "dark" : "light" })}>{preferences.theme === "light" ? "Dark Theme" : "Light Theme"}</button>
      {accessibilityOpen && (
        <div className="site-accessibility-panel">
          <span>Text size</span>
          {[["small", "A\u2212"], ["normal", "A"], ["large", "A+"]].map(([value, label]) => (
            <button className={preferences.textScale === value ? "is-selected" : ""} type="button" key={value} onClick={() => updatePreferences({ textScale: value })}>{label}</button>
          ))}
        </div>
      )}
      {showProfile && user && <ProfileMenu />}
    </div>
  );
}

export default UtilityBar;
