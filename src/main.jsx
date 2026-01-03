import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import { AuthProvider } from "./context/AuthContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    {/* React.StrictMode disabled to avoid double effects during field testing */}
    <BrowserRouter>
      {/* If deploying under a sub-path later, add basename here */}
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </>
);
