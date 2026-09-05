import React from "react";
import { Link } from "react-router-dom";
import heroMap from "./assets/hero.png";
import "./Dashboard.css";

function Dashboard() {
  return (
    <div className="dashboard">
      <header className="navbar">
        <Link className="logo" to="/" aria-label="SolveTogether home">SolveTogether</Link>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#home">Home</a>
          <a href="#problems">Problems</a>
          <a href="#about">About</a>
          <Link to="/login" className="login-btn">Login</Link>
        </nav>
      </header>

      <main>
        <section className="hero" id="home">
          <div className="sky-orb orb-left" />
          <div className="sky-orb orb-right" />
          <div className="horizon" aria-hidden="true" />
          <div className="hero-content">
            <h1><span>See a Problem ?<br />Report it.</span>{" "}We&rsquo;ll solve it</h1>
            <Link className="report-btn" to="/login">Report a Problem</Link>
          </div>
          <div className="map-wrap" aria-label="Jharkhand">
            <img src={heroMap} alt="Illustrated map of Jharkhand" />
          </div>
        </section>
        <section className="anchor-section" id="problems" aria-label="Problems" />
        <section className="anchor-section" id="about" aria-label="About" />
      </main>
    </div>
  );
}

export default Dashboard;
