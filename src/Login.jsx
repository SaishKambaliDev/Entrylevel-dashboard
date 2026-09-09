import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import lightLogo from "./assets/logoli.png";
import darkLogo from "./assets/logoda.png";
import { postAuth } from "./api/referenceData";
import UtilityBar, { setLanguageCookie, writePreferences } from "./UtilityBar";
import { usePreferences } from "./usePreferences";
import "./Login.css";

function Login() {
  const navigate = useNavigate();
  const [preferences, updatePreferences] = usePreferences();
  const { theme, textScale } = preferences;
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const showComingSoon = (event, message) => { event.preventDefault(); setNotice(message); };
  const submitLogin = async (event) => {
    event.preventDefault();
    setNotice("");
    setIsSubmitting(true);
    try {
      const data = await postAuth("/auth/login", { email, password });
      sessionStorage.setItem("jansamadhanAuthToken", data.token);
      sessionStorage.setItem("jansamadhanUser", JSON.stringify(data.user));
      if (data.user.language) {
        updatePreferences({ language: data.user.language });
        writePreferences({ language: data.user.language });
        setLanguageCookie(data.user.language);
      }
      window.location.assign("/");
    } catch (error) {
      setNotice(error.message || "Unable to log in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return <div className={`login-page login-theme-${theme} login-text-${textScale}`}>
    <UtilityBar preferences={preferences} updatePreferences={updatePreferences} />
    <main className="login-main">
      <section className="login-intro" aria-label="JanSamadhan introduction">
        <Link className="login-logo" to="/" aria-label="JanSamadhan home"><img src={theme === "light" ? lightLogo : darkLogo} alt="JanSamadhan — Initiative by Government of Jharkhand" /></Link>
        <div className="login-intro-copy"><p className="login-eyebrow">Together, for Jharkhand</p><h1>Welcome back.</h1><p>Sign in to report problems, follow progress, and help turn local challenges into shared solutions.</p></div>
        <Link className="back-home" to="/">← Back to home</Link>
      </section>
      <section className="login-form-area" aria-labelledby="login-title"><div className="login-box">
        <div className="login-heading"><p className="login-eyebrow">Account access</p><h2 id="login-title">Log in</h2><p>Enter your details to continue to JanSamadhan.</p></div>
        <form onSubmit={submitLogin}>
          <div className="input-group"><label htmlFor="email">Email address</label><input id="email" type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <div className="input-group"><label htmlFor="password">Password</label><input id="password" type="password" placeholder="Enter your password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          <button className="forgot-password" type="button" onClick={(event) => showComingSoon(event, "Password recovery will be available soon.")}>Forgot password?</button>
          <button type="submit" className="login-submit" disabled={isSubmitting}>{isSubmitting ? "Logging in…" : "Log in"}</button>
        </form>
        <div className="login-divider"><span>or</span></div>
        <button className="google-button" type="button" onClick={(event) => showComingSoon(event, "Google sign-in is coming soon.")}><span className="google-mark" aria-hidden="true">G</span>Continue with Google</button>
        {notice && <p className="login-notice" role="status">{notice}</p>}
        <p className="register-text">New to JanSamadhan? <button type="button" onClick={() => navigate("/register")}>Create account</button></p>
      </div></section>
    </main>
  </div>;
}

export default Login;
