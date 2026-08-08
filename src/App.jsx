import { Component, useState, useEffect, lazy, Suspense } from "react";
import { Routes, Route, NavLink, useLocation, useNavigate } from "react-router-dom";
import "./App.css";

import prowestLogo from "./assets/prowest-logo.png";
import { supabase } from "./lib/supabaseClient.js";

const Login = lazy(() => import("./pages/Login.jsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.jsx"));

const Admin = lazy(() => import("./pages/Admin.jsx"));
const Contacts = lazy(() => import("./pages/Contacts.jsx"));
const Documents = lazy(() => import("./pages/Documents.jsx"));
const EquipmentRegister = lazy(() => import("./pages/EquipmentRegister.jsx"));
const Jobs = lazy(() => import("./pages/Jobs.jsx"));
const JobPlanning = lazy(() => import("./pages/JobPlanning.jsx"));
const MyJobs = lazy(() => import("./pages/MyJobs.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const Schedule = lazy(() => import("./pages/Schedule.jsx"));
const ShoppingList = lazy(() => import("./pages/ShoppingList.jsx"));
const Take5 = lazy(() => import("./pages/Take5.jsx"));
const Take5Register = lazy(() => import("./pages/Take5Register.jsx"));
const Timesheets = lazy(() => import("./pages/Timesheets.jsx"));
const VehiclePrestart = lazy(() => import("./pages/VehiclePrestart.jsx"));
const VehiclePrestartRegister = lazy(() => import("./pages/VehiclePrestartRegister.jsx"));
const Weather = lazy(() => import("./pages/Weather.jsx"));


const NotificationBell = lazy(() => import("./components/NotificationBell.jsx"));

const MAPS_DEBUG_BUILD_ID = "maps-ipad-compat-2026-08-08";

function sanitizeRouteError(error) {
  if (!error || typeof error !== "object") {
    return { name: "Error", message: "The Maps page failed to start." };
  }

  return {
    name: typeof error.name === "string" ? error.name : "Error",
    message:
      typeof error.message === "string" && error.message
        ? error.message
        : "The Maps page failed to start.",
  };
}

function setMapsChunkStatus(status, error) {
  if (typeof window === "undefined") return;
  const safeError = error ? sanitizeRouteError(error) : null;
  window.__pwMapsChunkStatus = {
    status,
    error: safeError,
    updatedAt: new Date().toISOString(),
  };
}

function loadMapsRoute() {
  setMapsChunkStatus("loading");
  return import("./pages/Maps.jsx")
    .then((module) => {
      setMapsChunkStatus("loaded");
      return module;
    })
    .catch((error) => {
      setMapsChunkStatus("failed", error);
      throw error;
    });
}

const Maps = lazy(loadMapsRoute);

import Home from "./pages/Home.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { useAuth } from "./context/AuthContext.jsx";

function isMapsDebugEnabled(search) {
  try {
    return new URLSearchParams(search).get("mapsDebug") === "1";
  } catch {
    return false;
  }
}

function detectSafariDetails(userAgent) {
  const safariMatch = userAgent.match(/Version\/([\d.]+).*Safari\//);
  const ipadosMatch = userAgent.match(/OS ([\d_]+) like Mac OS X/);
  const isIpad =
    /iPad/.test(userAgent) ||
    (typeof navigator !== "undefined" &&
      navigator.platform === "MacIntel" &&
      navigator.maxTouchPoints > 1);

  return {
    isIpad,
    safariVersion: safariMatch ? safariMatch[1] : "not detected",
    ipadosVersion: ipadosMatch ? ipadosMatch[1].replace(/_/g, ".") : "not detected",
  };
}

function readMapsDebugSnapshot() {
  if (typeof window === "undefined") {
    return {
      build: MAPS_DEBUG_BUILD_ID,
      target: "safari13/es2020",
      phase: "server-render",
      userAgent: "unavailable",
      safari: "not detected",
      ipados: "not detected",
      viewport: "unavailable",
      orientation: "unavailable",
      visualViewport: "unavailable",
      mapContainer: "unavailable",
      mapParent: "unavailable",
      mapFullscreen: "unavailable",
      toolsToolbar: "unavailable",
      shellHamburger: "unavailable",
      layoutMode: "unavailable",
      breakpoints: "unavailable",
      mapStatus: "unavailable",
      serviceWorker: "unavailable",
      mapsChunk: "not requested",
      googleScript: "unavailable",
      features: "unavailable",
      error: "none",
    };
  }

  const userAgent = navigator.userAgent || "";
  const safari = detectSafariDetails(userAgent);
  const mapNode =
    document.querySelector("[data-map-container]") ||
    document.querySelector(".maps-map");
  const mapRect = mapNode ? mapNode.getBoundingClientRect() : null;
  const mapParentRect = mapNode?.parentElement?.getBoundingClientRect?.() || null;
  const fullscreenNode = document.querySelector(".maps-fullscreen");
  const fullscreenRect = fullscreenNode?.getBoundingClientRect?.() || null;
  const toolsNode = document.querySelector(".maps-floating-tools");
  const toolsRect = toolsNode?.getBoundingClientRect?.() || null;
  const hamburgerNode = document.querySelector(".mobile-hamburger");
  const hamburgerRect = hamburgerNode?.getBoundingClientRect?.() || null;
  const runtimeStatus = window.__pwMapsRuntimeStatus || null;
  const chunkStatus = window.__pwMapsChunkStatus || { status: "not requested" };
  const googleScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
  const googleReady = Boolean(window.google && window.google.maps);
  const swAvailable = Boolean(navigator.serviceWorker);
  const swControlled = swAvailable && Boolean(navigator.serviceWorker.controller);
  const error = chunkStatus.error || null;

  return {
    build: MAPS_DEBUG_BUILD_ID,
    target: "safari13/es2020",
    phase: chunkStatus.status || "not requested",
    userAgent,
    safari: safari.safariVersion,
    ipados: safari.isIpad ? safari.ipadosVersion : "not iPad",
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    orientation: window.innerWidth > window.innerHeight ? "landscape" : "portrait",
    visualViewport: window.visualViewport
      ? `${Math.round(window.visualViewport.width)}x${Math.round(window.visualViewport.height)}`
      : "unavailable",
    mapContainer: mapRect
      ? `${Math.round(mapRect.width)}x${Math.round(mapRect.height)}`
      : "not mounted",
    mapParent: mapParentRect
      ? `${Math.round(mapParentRect.width)}x${Math.round(mapParentRect.height)}`
      : "not mounted",
    mapFullscreen: fullscreenRect
      ? `${Math.round(fullscreenRect.width)}x${Math.round(fullscreenRect.height)}`
      : "not mounted",
    toolsToolbar: toolsRect
      ? `${Math.round(toolsRect.left)},${Math.round(toolsRect.top)} ${Math.round(toolsRect.width)}x${Math.round(toolsRect.height)}`
      : "not mounted",
    shellHamburger: hamburgerRect
      ? `${Math.round(hamburgerRect.left)},${Math.round(hamburgerRect.top)} ${Math.round(hamburgerRect.width)}x${Math.round(hamburgerRect.height)}`
      : "not mounted",
    layoutMode: runtimeStatus?.layoutMode || "not mounted",
    breakpoints: [
      `<=768:${window.matchMedia?.("(max-width: 768px)")?.matches ? "yes" : "no"}`,
      `<=900:${window.matchMedia?.("(max-width: 900px)")?.matches ? "yes" : "no"}`,
      `touch<=1180:${
        window.matchMedia?.("(max-width: 1180px) and (pointer: coarse)")?.matches
          ? "yes"
          : "no"
      }`,
      `coarse:${window.matchMedia?.("(pointer: coarse)")?.matches ? "yes" : "no"}`,
    ].join(", "),
    mapStatus: runtimeStatus
      ? [
          `containerReady:${runtimeStatus.mapContainerReady ? "yes" : "no"}`,
          `initialized:${runtimeStatus.mapInitialized ? "yes" : "no"}`,
          `attached:${runtimeStatus.mapAttached ? "yes" : "no"}`,
          `lastResize:${runtimeStatus.lastResizeAt || "none"}`,
        ].join(", ")
      : "not mounted",
    serviceWorker: swAvailable
      ? swControlled
        ? "controlled"
        : "available, not controlling"
      : "unavailable",
    mapsChunk: chunkStatus.status || "not requested",
    googleScript: googleReady ? "ready" : googleScript ? "script present" : "not requested",
    features: [
      `ResizeObserver:${typeof ResizeObserver !== "undefined" ? "yes" : "no"}`,
      `visualViewport:${window.visualViewport ? "yes" : "no"}`,
      `crypto.randomUUID:${
        typeof crypto !== "undefined" && crypto.randomUUID ? "yes" : "no"
      }`,
      `structuredClone:${typeof structuredClone !== "undefined" ? "yes" : "no"}`,
      `Promise.any:${Promise.any ? "yes" : "no"}`,
      `100dvh:${
        window.CSS && CSS.supports && CSS.supports("height", "100dvh") ? "yes" : "no"
      }`,
    ].join(", "),
    error: error ? `${error.name}: ${error.message}` : "none",
  };
}

function MapsDebugPanel() {
  const [snapshot, setSnapshot] = useState(() => readMapsDebugSnapshot());

  useEffect(() => {
    const refresh = () => setSnapshot(readMapsDebugSnapshot());
    refresh();
    const timer = window.setInterval(refresh, 1000);
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("orientationchange", refresh);
    };
  }, []);

  return (
    <aside className="maps-debug-panel" aria-label="Maps debug">
      <strong>Maps debug</strong>
      {Object.entries(snapshot).map(([key, value]) => (
        <div key={key}>
          <span>{key}</span>
          <code>{String(value)}</code>
        </div>
      ))}
    </aside>
  );
}

class MapsRouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    setMapsChunkStatus("failed", error);
  }

  render() {
    if (this.state.error) {
      const safeError = sanitizeRouteError(this.state.error);
      return (
        <div className="maps-route-error" role="alert">
          <h2>Maps could not load</h2>
          <p>{safeError.message}</p>
          <button type="button" className="btn-pill primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
import { AppVisibilityProvider } from "./context/AppVisibilityContext.jsx";

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  // Updated: rely on AuthContext canonical flags rather than "ADMIN" string checks
const { isAdmin, user, profile, displayName } = useAuth();

const cleanUserLabel = (value) => String(value || "").trim();
const sidebarUserName =
  cleanUserLabel(profile?.display_name) ||
  cleanUserLabel(displayName) ||
  cleanUserLabel(profile?.full_name) ||
  [profile?.first_name, profile?.last_name]
    .map(cleanUserLabel)
    .filter(Boolean)
    .join(" ")
    .trim() ||
  cleanUserLabel(user?.email);

 const isAuthPage = ["/login", "/reset-password"].includes(location.pathname);
 const isMapsPage = location.pathname === "/maps";

  const toggleSidebar = () => {
    // Desktop collapse toggle (existing behaviour)
    setSidebarCollapsed((prev) => !prev);
  };

  const handleSidebarTogglePointerDown = (event) => {
    event.stopPropagation();
  };

  const handleSidebarToggleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleSidebar();
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

const handleLogout = async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Logout failed:", error.message);
    return;
  }

  closeMobileSidebar();
  navigate("/login", { replace: true });
};

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
              <p>Licensed and Engineering Surveying</p>
            </div>
          </div>

          <div className="header-right">
            {/* 🔔 In-app notifications */}
            {!isAuthPage && user && (
  <Suspense fallback={null}>
    <NotificationBell />
  </Suspense>
)}

    <a
  href="https://prowestsurveying.com.au/"
  target="_blank"
  rel="noopener noreferrer"
  className="badge header-link"
>
  🌐 Pro West Surveying
</a>

<a
  href="tel:0892428247"
  className="badge header-link header-phone-link"
>
  📞 9242 8247
</a>
          </div>
        </div>
      </header>

      {/* ---------- LAYOUT WRAPPER ---------- */}
      <div className={`app-layout ${isMapsPage ? "app-layout-maps" : ""}`}>
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
                onPointerDown={handleSidebarTogglePointerDown}
                onClick={handleSidebarToggleClick}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {sidebarCollapsed ? "»" : "«"}
              </button>

              <div className="sidebar-heading-group">
                <div className="sidebar-user-heading">
                  {sidebarUserName || "Signed in"}
                </div>
              </div>

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
                {isAdmin && (
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

                <li>
                  <NavLink
                    to="/equipment-register"
                    className="nav-link"
                    onClick={closeMobileSidebar}
                  >
                    <span className="nav-icon">🧾</span>
                    <span className="nav-label">Equipment Register</span>
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
{isAdmin && (
  <li>
    <NavLink
      to="/job-planning"
      className="nav-link"
      onClick={closeMobileSidebar}
    >
      <span className="nav-icon">🗓️</span>
      <span className="nav-label">Job Planning</span>
    </NavLink>
  </li>
)}
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
                    <span className="nav-icon">📋</span>
                    <span className="nav-label">
                      Vehicle Prestart Register
                    </span>
                  </NavLink>
                </li>

<li>
  <NavLink
    to="/shopping-list"
    className="nav-link"
    onClick={closeMobileSidebar}
  >
    <span className="nav-icon">🛒</span>
    <span className="nav-label">Shopping List</span>
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
               {user && (
  <div className="sidebar-footer">
    <button
      type="button"
      className="nav-link logout-nav-button"
      onClick={handleLogout}
      title="Log out"
      aria-label="Log out"
    >
      <span className="nav-icon">🚪</span>
      <span className="nav-label">Logout</span>
    </button>
  </div>
)}
            </nav>
          </>
        )}

        {/* ---------- MAIN CONTENT ---------- */}
<main className={`main-content ${isMapsPage ? "main-content-maps" : ""}`}>
  {isMapsPage && isMapsDebugEnabled(location.search) && <MapsDebugPanel />}
  <Suspense fallback={<div className="page-loading">Loading portal...</div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
<Route path="/reset-password" element={<ResetPassword />} />

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
    <ProtectedRoute adminOnly>
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
  path="/job-planning"
  element={
    <ProtectedRoute adminOnly>
      <JobPlanning />
    </ProtectedRoute>
  }
/>
      <Route
        path="/maps"
        element={
          <ProtectedRoute>
            <MapsRouteErrorBoundary>
              <Maps />
            </MapsRouteErrorBoundary>
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
        path="/equipment-register"
        element={
          <ProtectedRoute>
            <EquipmentRegister />
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
  path="/shopping-list"
  element={
    <ProtectedRoute>
      <ShoppingList />
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
  </Suspense>
</main>
      </div>
    </div>
    </AppVisibilityProvider>
  );
}

export default App;
