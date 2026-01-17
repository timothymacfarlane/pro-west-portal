import { useState, useEffect } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import "./App.css";

import prowestLogo from "./assets/prowest-logo.png";

import Login from "./pages/Login.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

import Home from "./pages/Home.jsx";
import Admin from "./pages/Admin.jsx";
import Contacts from "./pages/Contacts.jsx";
import Documents from "./pages/Documents.jsx";
import Jobs from "./pages/Jobs.jsx";
import MyJobs from "./pages/MyJobs.jsx"; // ✅ ADDED
import Maps from "./pages/Maps.jsx";
import Profile from "./pages/Profile.jsx";
import Schedule from "./pages/Schedule.jsx";
import Take5 from "./pages/Take5.jsx";
import Take5Register from "./pages/Take5Register.jsx";
import Timesheets from "./pages/Timesheets.jsx";
import VehiclePrestart from "./pages/VehiclePrestart.jsx";
import VehiclePrestartRegister from "./pages/VehiclePrestartRegister.jsx";
import Weather from "./pages/Weather.jsx";

import NotificationBell from "./components/NotificationBell.jsx"; // 🔔 ADDED

import { useAuth } from "./context/AuthContext.jsx";

import { AppVisibilityProvider } from "./context/AppVisibilityContext.jsx";

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const location = useLocation();

  // Updated: rely on AuthContext canonical flags rather than "ADMIN" string checks
  const { isAdmin, authLoading } = useAuth();

  const isAuthPage = location.pathname === "/login";

  const toggleSidebar = () => {
    // Desktop collapse toggle (existing behaviour)
    setSidebarCollapsed((prev) => !prev);
  };

  const toggleMobileSidebar = () => {
    // Mobile slide-in menu
    setMobileSidebarOpen((prev) => !prev);

    // Ensure sidebar is expanded when using mobile drawer
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
  };

  const closeMobileSidebar = () => setMobileSidebarOpen(false);

  // Always close mobile drawer on route change (back/forward, programmatic nav, etc.)
  // Prevent background scroll when the mobile sidebar is open (better on iOS/Android)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    if (mobileSidebarOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <AppVisibilityProvider>
    <div className="app-root">
      {/* ---------- TOP HEADER ---------- */}
      <header className="app-header">
        <div className="header-inner">
          <div className="header-left">
            {/* MOBILE HAMBURGER (hidden on login page) */}
            {!isAuthPage && (
              <button
                className="mobile-hamburger"
                onClick={toggleMobileSidebar}
                type="button"
                aria-label="Open menu"
                title="Open menu"
              >
                ☰
              </button>
            )}

            <div className="logo-mark">
              <img
                src={prowestLogo}
                alt="Pro West Surveying"
                className="logo-img"
              />
            </div>
            <div className="header-text">
              <h1>Pro West Portal</h1>
              <p>Internal Job &amp; Operations Hub</p>
            </div>
          </div>

          <div className="header-right">
            {/* 🔔 In-app notifications */}
            {!isAuthPage && <NotificationBell />}

            <a
              href="https://prowestsurveying.com.au/"
              target="_blank"
              rel="noopener noreferrer"
              className="badge header-link"
            >
              Pro West Surveying
            </a>
            <span className="badge badge-secondary">9242 8247</span>
          </div>
        </div>
      </header>

      {/* ---------- LAYOUT WRAPPER ---------- */}
      <div className="app-layout">
        {/* ---------- SIDEBAR (DESKTOP + MOBILE) ---------- */}
        {!isAuthPage && (
          <>
            {/* MOBILE BACKDROP */}
            {mobileSidebarOpen && (
              <div
                className="sidebar-backdrop"
                onClick={closeMobileSidebar}
                aria-hidden="true"
              />
            )}

            {/* SIDEBAR */}
            <nav
              className={`sidebar 
                ${sidebarCollapsed ? "collapsed" : ""} 
                ${mobileSidebarOpen ? "sidebar-open" : ""}`}
            >
              {/* TOP TOGGLE BUTTON (DESKTOP COLLAPSE) */}
              <button
                className="sidebar-toggle"
                type="button"
                onClick={toggleSidebar}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? "»" : "«"}
              </button>

              {!sidebarCollapsed && <h2 className="sidebar-title">Pages</h2>}

              <ul className="nav-list">
                <li>
                  <NavLink
                    to="/"
                    end
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">🏠</span>
                    <span className="nav-label">Home</span>
                  </NavLink>
                </li>

                {/* Admin tab: only show once auth has resolved, and user is admin */}
                {!authLoading && isAdmin && (
                  <li>
                    <NavLink
                      to="/admin"
                      className="nav-link"
                      onClick={closeMobileSidebar}
                    >
                      <span className="nav-icon">🛠</span>
                      <span className="nav-label">Administration</span>
                    </NavLink>
                  </li>
                )}

                <li>
                  <NavLink
                    to="/profile"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">👤</span>
                    <span className="nav-label">My Profile</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/contacts"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">📇</span>
                    <span className="nav-label">Contacts</span>
                  </NavLink>
                </li>


                <li>
                  <NavLink
                    to="/documents"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">📄</span>
                    <span className="nav-label">Documents</span>
                  </NavLink>
                </li>
                {/* ✅ ADDED: My Jobs */}
                <li>
                  <NavLink
                    to="/my-jobs"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">🧰</span>
                    <span className="nav-label">My Jobs</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/jobs"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">📁</span>
                    <span className="nav-label">Jobs</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/maps"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">🗺️</span>
                    <span className="nav-label">Maps</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/schedule"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">📅</span>
                    <span className="nav-label">Schedule</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/take5"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">📝</span>
                    <span className="nav-label">Take 5</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/take5-register"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">📋</span>
                    <span className="nav-label">Take 5 Register</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/timesheets"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">⏱️</span>
                    <span className="nav-label">Timesheets</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/vehicle-prestart"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">🚗</span>
                    <span className="nav-label">Vehicle Prestart</span>
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/vehicle-prestart-register"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">🚗📋</span>
                    <span className="nav-label">
                      Vehicle Prestart Register
                    </span>
                  </NavLink>
                </li>

                <li>
                  <NavLink
                    to="/weather"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">🌦️</span>
                    <span className="nav-label">Weather</span>
                  </NavLink>
                </li>
              </ul>
            </nav>
          </>
        )}

        {/* ---------- MAIN CONTENT ---------- */}
        <main className="main-content">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <Admin />
                </ProtectedRoute>
              }
            />

            <Route
              path="/contacts"
              element={
                <ProtectedRoute>
                  <Contacts />
                </ProtectedRoute>
              }
            />



            <Route
              path="/documents"
              element={
                <ProtectedRoute>
                  <Documents />
                </ProtectedRoute>
              }
            />
            {/* ✅ ADDED: My Jobs route */}
            <Route
              path="/my-jobs"
              element={
                <ProtectedRoute>
                  <MyJobs />
                </ProtectedRoute>
              }
            />

            <Route
              path="/jobs"
              element={
                <ProtectedRoute>
                  <Jobs />
                </ProtectedRoute>
              }
            />

            <Route
              path="/maps"
              element={
                <ProtectedRoute>
                  <Maps />
                </ProtectedRoute>
              }
            />

            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            <Route
              path="/schedule"
              element={
                <ProtectedRoute>
                  <Schedule />
                </ProtectedRoute>
              }
            />

            <Route
              path="/take5"
              element={
                <ProtectedRoute>
                  <Take5 />
                </ProtectedRoute>
              }
            />

            <Route
              path="/take5-register"
              element={
                <ProtectedRoute>
                  <Take5Register />
                </ProtectedRoute>
              }
            />

            <Route
              path="/timesheets"
              element={
                <ProtectedRoute>
                  <Timesheets />
                </ProtectedRoute>
              }
            />

            <Route
              path="/vehicle-prestart"
              element={
                <ProtectedRoute>
                  <VehiclePrestart />
                </ProtectedRoute>
              }
            />

            <Route
              path="/vehicle-prestart-register"
              element={
                <ProtectedRoute>
                  <VehiclePrestartRegister />
                </ProtectedRoute>
              }
            />

            <Route
              path="/weather"
              element={
                <ProtectedRoute>
                  <Weather />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
    </AppVisibilityProvider>
  );
}

export default App;
