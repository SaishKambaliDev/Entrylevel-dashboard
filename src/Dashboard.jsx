import React from "react";
import { Link } from "react-router-dom";
import "./Dashboard.css";

function Dashboard() {
  return (
    <div className="dashboard">

      {/* Navbar */}
      <header className="navbar">

        <div className="logo">
          Civic<span>Solve</span>
        </div>

        <nav className="nav-links">
          <a href="#home">Home</a>
          <a href="#about">About</a>
          <a href="#contact">Contact Us</a>
<Link to="/login" className="login-btn">
  Login
</Link>
        </nav>

      </header>


      {/* Hero Section */}
      <main>

        <section className="hero" id="home">

          {/* Left Content */}
          <div className="hero-content">

            <h1>
              Turning
              <span> Societal Problems </span>
              Into Real Solutions
            </h1>

            <p>
              CivicSolve is a collaborative platform where citizens
              can share real-world societal challenges and connect
              with universities, industries and government
              organizations to develop meaningful solutions.
            </p>

          </div>


          {/* Project Information Card */}
          <div className="project-card">

            <h2>
              What is CivicSolve?
            </h2>

            <p>
              CivicSolve connects citizens with students,
              universities, industries and government bodies
              to collaboratively solve real-world societal
              challenges.
            </p>


            <div className="process">

              <div className="process-item">

                <div className="process-icon">
                  👤
                </div>

                <div>
                  <strong>Citizen</strong>
                  <small>Raise a problem</small>
                </div>

              </div>


              <div className="arrow">
                ↓
              </div>


              <div className="process-item">

                <div className="process-icon">
                  🎓
                </div>

                <div>
                  <strong>University</strong>
                  <small>Develop solutions</small>
                </div>

              </div>


              <div className="arrow">
                ↓
              </div>


              <div className="process-item">

                <div className="process-icon">
                  🏢
                </div>

                <div>
                  <strong>Industry</strong>
                  <small>Provide expertise</small>
                </div>

              </div>

            </div>

          </div>

        </section>


        {/* About Section */}
        <section className="about" id="about">

          <div className="section-heading">

            <span>ABOUT US</span>

            <h2>
              Solving Problems Together
            </h2>

            <p>
              We bring citizens, educational institutions,
              industries and government organizations together
              on one collaborative platform.
            </p>

          </div>


          <div className="about-cards">

            <div className="about-card">

              <div className="about-icon">
                🗣️
              </div>

              <h3>
                Citizens
              </h3>

              <p>
                Report problems and challenges faced by
                communities.
              </p>

            </div>


            <div className="about-card">

              <div className="about-icon">
                🎓
              </div>

              <h3>
                Universities
              </h3>

              <p>
                Students and researchers work on practical
                societal problems.
              </p>

            </div>


            <div className="about-card">

              <div className="about-icon">
                🏭
              </div>

              <h3>
                Industry
              </h3>

              <p>
                Provide technology, expertise and resources
                for innovative solutions.
              </p>

            </div>

          </div>

        </section>


        {/* Contact Section */}
        <section className="contact" id="contact">

          <div>

            <span>
              GET INVOLVED
            </span>

            <h2>
              Have a Problem to Solve?
            </h2>

            <p>
              Join CivicSolve and become part of a community
              working towards meaningful change.
            </p>

          </div>

        </section>

      </main>


      {/* Footer */}
      <footer>

        <div className="logo">
          Civic<span>Solve</span>
        </div>

        <p>
          © 2026 CivicSolve. Building solutions together.
        </p>

      </footer>

    </div>
  );
}

export default Dashboard;
