import React, { useState } from "react";
import "./Login.css";

function Login() {

  const [role, setRole] = useState("citizen");

  const handleLogin = (e) => {
    e.preventDefault();

    console.log("Role:", role);

    
  };

  return (
    <div className="login-page">

      {/* Left Side */}
      <div className="login-info">

        <div className="login-logo">
          Civic<span>Solve</span>
        </div>

        <h1>
          Welcome Back!
        </h1>

        <p>
          Connect, collaborate and help build solutions
          for real-world societal challenges.
        </p>

      </div>


      {/* Login Box */}
      <div className="login-container">

        <div className="login-box">

          <h2>
            Login
          </h2>

          <p className="login-subtitle">
            Login to your CivicSolve account
          </p>


          <form onSubmit={handleLogin}>

            {/* Role */}
            <div className="input-group">

              <label>
                Login as
              </label>

              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >

                <option value="citizen">
                  Citizen
                </option>

                <option value="university">
                  University
                </option>

                <option value="industry">
                  Industry
                </option>

              </select>

            </div>


            {/* Email */}
            <div className="input-group">

              <label>
                Email
              </label>

              <input
                type="email"
                placeholder="Enter your email"
                required
              />

            </div>


            {/* Password */}
            <div className="input-group">

              <label>
                Password
              </label>

              <input
                type="password"
                placeholder="Enter your password"
                required
              />

            </div>


            <div className="forgot">
              <a href="#">
                Forgot Password?
              </a>
            </div>


            <button
              type="submit"
              className="login-submit"
            >
              Login
            </button>

          </form>


          {/* Register */}
          <div className="register-text">

            <span>
              Don't have an account?
            </span>

            <a href="/register">
              Register
            </a>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Login;
