import React, { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { auth } from "./auth.js";
import { AlertsProvider } from "./AlertsContext.jsx";
import TopBar from "./components/layout/TopBar.jsx";
import Sidebar from "./components/layout/Sidebar.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Rules from "./pages/Rules.jsx";
import Alerts from "./pages/Alerts.jsx";
import Service from "./pages/Service.jsx";
import Config from "./pages/Config.jsx";
import System from "./pages/System.jsx";
import Pcap from "./pages/Pcap.jsx";
import Logs from "./pages/Logs.jsx";
import Console from "./pages/Console.jsx";
import ML from "./pages/ML.jsx";
import Login from "./pages/Login.jsx";

function SOCLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  return (
    <div className="app-container">
      <TopBar
        onToggleSidebar={toggleSidebar}
        sidebarCollapsed={sidebarCollapsed}
      />
      <div className="app-body">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/ml" element={<ML />} />
            <Route path="/pcap" element={<Pcap />} />
            <Route path="/service" element={<Service />} />
            <Route path="/config" element={<Config />} />
            <Route path="/system" element={<System />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/console" element={<Console />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(auth.isAuthenticated());

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <AlertsProvider>
      <SOCLayout />
    </AlertsProvider>
  );
}
