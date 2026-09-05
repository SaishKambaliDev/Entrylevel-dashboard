import { useState } from "react";
import { Link } from "react-router-dom";
import heroMap from "./assets/hero.png";
import "./Dashboard.css";

const aboutCards = [
  ["01", "Citizen Submit", "Citizens submit real-world problems from their communities."],
  ["02", "HEIs Solve", "Higher Education Institutions work on solutions through students and faculty."],
  ["03", "Industries Collaborate", "Industries and startups provide collaboration, expertise and support."],
];

const contributors = ["Citizens", "Universities / HEIs", "Industries & Startups", "Government / Local Bodies"];

function Dashboard() {
  const [theme, setTheme] = useState("light");
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [textScale, setTextScale] = useState("normal");

  return (
    <div className={`dashboard theme-${theme} text-${textScale}`}>
      <div className="accessibility-bar">
        <button className="accessibility-trigger" type="button" onClick={() => setAccessibilityOpen(!accessibilityOpen)} aria-expanded={accessibilityOpen}>Accessibility</button>
        <button className="theme-button is-active" type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}>{theme === "light" ? "Dark Theme" : "Light Theme"}</button>
        {accessibilityOpen && <div className="accessibility-panel" aria-label="Text size controls"><span>Text size</span><button className={textScale === "small" ? "is-selected" : ""} type="button" onClick={() => setTextScale("small")}>A−</button><button className={textScale === "normal" ? "is-selected" : ""} type="button" onClick={() => setTextScale("normal")}>A</button><button className={textScale === "large" ? "is-selected" : ""} type="button" onClick={() => setTextScale("large")}>A+</button></div>}
      </div>

      <header className="navbar">
        <Link className="logo" to="/" aria-label="SolveTogether home">SolveTogether</Link>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#home">Home</a>
          <a href="#problems">Problems</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
          <Link to="/login">Login</Link>
          <Link className="signup-btn" to="/login">Sign Up</Link>
        </nav>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="sky-orb orb-left" />
          <div className="sky-orb orb-right" />
          <div className="dark-hero-circles" aria-hidden="true"><span /><span /><span /></div>
          <div className="horizon" aria-hidden="true" />
          <div className="hero-content">
            <p className="eyebrow">Together, for Jharkhand</p>
            <h1><span>See a Problem?</span><br />Report it. We&rsquo;ll solve it.</h1>
            <div className="hero-actions">
              <Link className="report-btn" to="/login">Report a Problem</Link>
              <a className="explore-link" href="#problems">Explore Problems</a>
            </div>
          </div>
          <div className="map-wrap" aria-hidden="true"><img src={heroMap} alt="" /></div>
        </section>

        <section className="about-section" id="about">
          <div className="section-heading">
            <p className="eyebrow">How it works</p>
            <h2>Real problems. Shared solutions.</h2>
          </div>
          <div className="about-grid">
            {aboutCards.map(([number, title, copy]) => <article className="about-card" key={title}><span className="card-number">{number}</span><span className="card-mark" aria-hidden="true" /><h3>{title}</h3><p>{copy}</p><span className="card-arrow" aria-hidden="true">→</span></article>)}
          </div>
        </section>

        <section className="contributors-section" id="problems">
          <div className="section-heading centered">
            <p className="eyebrow">Everyone has a role</p>
            <h2>Who can solve?</h2>
          </div>
          <div className="contributors-list">
            {contributors.map((contributor, index) => <div key={contributor}><span>{String(index + 1).padStart(2, "0")}</span>{contributor}</div>)}
          </div>
        </section>
      </main>

      <footer className="footer" id="contact">
        <div><Link className="footer-logo" to="/">SolveTogether</Link><p>Connecting communities with people who can help solve what matters.</p></div>
        <div><h3>Contact</h3><a href="mailto:hello@solvetogether.in">hello@solvetogether.in</a><p>Jharkhand, India</p></div>
        <div><h3>Explore</h3><a href="#home">Home</a><a href="#problems">Problems</a><a href="#about">About</a></div>
        <p className="copyright">© 2026 SolveTogether. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default Dashboard;
