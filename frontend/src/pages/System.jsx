import React, { useEffect, useState, useMemo } from "react";
import {
  Server,
  Cpu,
  HardDrive,
  Activity,
  Layers,
  Network,
  CheckCircle2,
  Zap,
  Search,
  Filter,
  Package
} from "lucide-react";
import { api } from "../api.js";
import PageHeader from "../components/layout/PageHeader.jsx";
import StatCard from "../components/ui/StatCard.jsx";
import Badge from "../components/ui/Badge.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";

const KINDS = [
  { value: "inspector", label: "Inspecteurs de flux (Inspectors)" },
  { value: "codec", label: "Décodeurs réseaux (Codecs)" },
  { value: "logger", label: "Gestionnaires de journaux (Loggers)" },
  { value: "ips_action", label: "Actions IPS" },
  { value: "ips_option", label: "Options de règles IPS" },
];

export default function System() {
  const [info, setInfo] = useState(null);
  const [interfaces, setInterfaces] = useState([]);
  const [daqs, setDaqs] = useState([]);
  const [plugins, setPlugins] = useState([]);
  const [kind, setKind] = useState("inspector");
  const [pluginSearch, setPluginSearch] = useState("");

  useEffect(() => {
    api.systemInfo().then(setInfo).catch(() => {});
    api.interfaces().then(setInterfaces).catch(() => {});
    api.daqs().then(setDaqs).catch(() => {});
  }, []);

  useEffect(() => {
    api.plugins(kind).then(setPlugins).catch(() => {});
  }, [kind]);

  const filteredPlugins = useMemo(() => {
    if (!pluginSearch.trim()) return plugins;
    const q = pluginSearch.toLowerCase();
    return plugins.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.help?.toLowerCase().includes(q) ||
      p.type?.toLowerCase().includes(q)
    );
  }, [plugins, pluginSearch]);

  const interfaceColumns = [
    {
      key: "name",
      label: "Interface",
      width: 140,
      render: (val) => <span className="mono" style={{ fontWeight: 700, color: "var(--soc-accent)" }}>{val}</span>
    },
    {
      key: "up",
      label: "Statut",
      width: 100,
      render: (val) => (
        <Badge variant={val ? "success" : "neutral"} dot={val}>
          {val ? "UP (Actif)" : "DOWN"}
        </Badge>
      )
    },
    {
      key: "addresses",
      label: "Adresses assignées / IPv4",
      render: (val, row) => (
        <span className="mono">
          {Array.isArray(val) && val.length > 0 ? val.join(", ") : (row.description || "—")}
        </span>
      )
    }
  ];

  const daqColumns = [
    {
      key: "name",
      label: "Module DAQ",
      width: 130,
      render: (val) => <span className="mono" style={{ fontWeight: 700 }}>{val}</span>
    },
    {
      key: "mode",
      label: "Mode",
      width: 110,
      render: (val) => <span className="badge neutral mono">{val}</span>
    },
    {
      key: "description",
      label: "Description du module",
      render: (val) => <span>{val}</span>
    }
  ];

  const pluginColumns = [
    {
      key: "name",
      label: "Nom du Plugin",
      width: 180,
      render: (val) => <span className="mono" style={{ fontWeight: 600, color: "var(--soc-accent)" }}>{val}</span>
    },
    {
      key: "type",
      label: "Type",
      width: 120,
      render: (val) => <span className="badge neutral mono">{val}</span>
    },
    {
      key: "help",
      label: "Description / Usage",
      render: (val) => <span style={{ color: "var(--soc-text-secondary)" }}>{val || "—"}</span>
    }
  ];

  return (
    <div>
      <PageHeader
        title="Introspection Système & Ressources"
        subtitle="Métriques matérielles de l'appliance, modules DAQ, interfaces réseau et registre des plugins Snort 3."
      />

      {/* Hardware Resource Usage Bars */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">
            <Cpu size={16} color="var(--soc-accent)" />
            <span>Ressources Système de l'Appliance</span>
          </h3>
          <span style={{ fontSize: 12, color: "var(--soc-text-muted)" }}>
            Appliance Linux IDS-Hybride • Port 8000
          </span>
        </div>

        <div className="grid cols-3" style={{ gap: 20 }}>
          {/* CPU Bar */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--soc-text-secondary)" }}>Charge CPU</span>
              <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--soc-success)" }}>18%</span>
            </div>
            <div style={{ height: 8, background: "var(--soc-bg-base)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: "18%", height: "100%", background: "#10b981", borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--soc-text-muted)", marginTop: 4 }}>Inspection multi-threads nominale</div>
          </div>

          {/* RAM Bar */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--soc-text-secondary)" }}>Mémoire RAM</span>
              <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--soc-accent)" }}>42% (1.68 / 4.0 Go)</span>
            </div>
            <div style={{ height: 8, background: "var(--soc-bg-base)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: "42%", height: "100%", background: "#3b82f6", borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--soc-text-muted)", marginTop: 4 }}>Buffers DAQ & tables de session alloués</div>
          </div>

          {/* Disk Bar */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--soc-text-secondary)" }}>Stockage / Logs</span>
              <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--soc-text-primary)" }}>29%</span>
            </div>
            <div style={{ height: 8, background: "var(--soc-bg-base)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: "29%", height: "100%", background: "#38bdf8", borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--soc-text-muted)", marginTop: 4 }}>Partition /var/log/ids-hybride</div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <StatCard
          label="Version Snort"
          value={info?.version || "Snort 3"}
          sub={`Build : ${info?.build || "Appliance release"}`}
          icon={<Server size={20} />}
          color="accent"
        />

        <StatCard
          label="Total Plugins"
          value={info?.total_plugins ?? "—"}
          sub={`${info?.inspectors || 0} inspecteurs • ${info?.codecs || 0} codecs`}
          icon={<Package size={20} />}
          color="info"
        />

        <StatCard
          label="Modules DAQ"
          value={info?.daq_modules ?? "—"}
          sub="Drivers d'acquisition de paquets"
          icon={<Activity size={20} />}
          color="success"
        />

        <StatCard
          label="Accélération Hyperscan"
          value={info?.hyperscan ? "ACTIVÉ" : "DÉSACTIVÉ"}
          sub={info?.hyperscan ? "Regex Intel HS vectorisées" : "Moteur PCRE standard"}
          icon={<Zap size={20} />}
          color={info?.hyperscan ? "success" : "warning"}
        />
      </div>

      {/* Network Interfaces and DAQs */}
      <div className="grid cols-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Network size={16} color="var(--soc-accent)" />
              <span>Interfaces réseau physiques & virtuelles</span>
            </h3>
          </div>
          <DataTable
            columns={interfaceColumns}
            data={interfaces}
            searchKeys={["name", "description"]}
            exportFilename="system_interfaces"
            pagination={false}
            emptyMessage="Aucune interface réseau détectée."
          />
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Activity size={16} color="var(--soc-success)" />
              <span>Modules DAQ d'acquisition</span>
            </h3>
          </div>
          <DataTable
            columns={daqColumns}
            data={daqs}
            searchKeys={["name", "description"]}
            exportFilename="system_daqs"
            pagination={false}
            emptyMessage="Aucun module DAQ disponible."
          />
        </div>
      </div>

      {/* Plugins Section */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <Layers size={16} color="var(--soc-accent)" />
            <span>Catalogue des Plugins Snort ({plugins.length})</span>
          </h3>

          <div className="flex items-center gap-3">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              style={{ width: "auto", minWidth: 220 }}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>
        </div>

        <DataTable
          columns={pluginColumns}
          data={filteredPlugins}
          searchKeys={["name", "type", "help"]}
          exportFilename={`snort_plugins_${kind}`}
          emptyMessage="Aucun plugin trouvé pour cette catégorie."
        />
      </div>
    </div>
  );
}
