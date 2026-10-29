import React, { useEffect, useState } from "react";
import {
  Settings,
  HelpCircle,
  FileCode,
  Sliders,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Save,
  RotateCcw
} from "lucide-react";
import { api } from "../api.js";
import { useToast } from "../useToast.jsx";
import PageHeader from "../components/layout/PageHeader.jsx";
import Button from "../components/ui/Button.jsx";
import Tooltip from "../components/ui/Tooltip.jsx";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";

const PROFILES = [
  ["none", "Aucun (Configuration brute Lua)"],
  ["connectivity", "Connectivity (Priorité débit et disponibilité réseau)"],
  ["balanced", "Balanced (Compromis recommandé détection / performance)"],
  ["security", "Security (Inspection approfondie et sécurité renforcée)"],
  ["max_detect", "Max Detect (Analyse maximale de tous les flux)"],
];

export default function Config() {
  const [cfg, setCfg] = useState(null);
  const [tab, setTab] = useState("simple"); // "simple" | "raw"
  const [raw, setRaw] = useState(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [validateBusy, setValidateBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const { show, node } = useToast();

  useEffect(() => {
    api.getConfig()
      .then(setCfg)
      .catch((e) => show(e.message, "err"));
  }, []);

  useEffect(() => {
    if (tab === "raw" && raw === null) {
      api.getRawConfig()
        .then(setRaw)
        .catch((e) => show(e.message, "err"));
    }
  }, [tab, raw]);

  // Client-side validation
  const validateFields = () => {
    const errs = {};
    if (!cfg.home_net?.trim()) {
      errs.home_net = "Le réseau HOME_NET ne peut pas être vide.";
    }
    if (!cfg.external_net?.trim()) {
      errs.external_net = "Le réseau EXTERNAL_NET ne peut pas être vide.";
    }
    if (!cfg.interface?.trim()) {
      errs.interface = "L'interface réseau est requise.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveSimple = async () => {
    if (!validateFields()) {
      show("Veuillez corriger les champs invalides.", "err");
      return;
    }
    setSaveBusy(true);
    try {
      const res = await api.updateConfig(cfg);
      setCfg(res);
      show("Configuration enregistrée avec succès ✓");
    } catch (e) {
      show(e.message, "err");
    } finally {
      setSaveBusy(false);
    }
  };

  const saveRaw = async () => {
    if (!raw?.content) return;
    setSaveBusy(true);
    try {
      const res = await api.updateRawConfig(raw.content);
      setRaw(res);
      show("Fichier snort.lua enregistré ✓");
    } catch (e) {
      show(e.message, "err");
    } finally {
      setSaveBusy(false);
    }
  };

  const testConfig = async () => {
    setValidateBusy(true);
    try {
      const res = await api.validateRules();
      if (res.ok) {
        show("Validation syntaxique Snort réussie (0 erreur) ✓", "ok");
      } else {
        show(res.output || "Erreur de syntaxe dans la configuration", "err");
      }
    } catch (e) {
      show(e.message, "err");
    } finally {
      setValidateBusy(false);
    }
  };

  if (!cfg) {
    return <LoadingSpinner full={true} message="Chargement des directives Snort 3..." />;
  }

  const setField = (k, v) => {
    setCfg(prev => ({ ...prev, [k]: v }));
    if (errors[k]) {
      setErrors(prev => ({ ...prev, [k]: null }));
    }
  };

  return (
    <div>
      <PageHeader
        title="Configuration du Moteur Snort"
        subtitle="Définition des sous-réseaux protégés ($HOME_NET), profils d'inspection et édition de snort.lua."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<ShieldCheck size={14} color="#10b981" />}
              onClick={testConfig}
              loading={validateBusy}
              title="Exécuter snort -T pour valider la syntaxe"
            >
              Tester la syntaxe (snort -T)
            </Button>
          </div>
        }
      />

      {/* Tabs Switcher */}
      <div className="flex gap-2" style={{ marginBottom: 20 }}>
        <button
          className={`btn ${tab === "simple" ? "primary" : "secondary"}`}
          onClick={() => setTab("simple")}
        >
          <Sliders size={15} />
          <span>Configuration Assistée</span>
        </button>
        <button
          className={`btn ${tab === "raw" ? "primary" : "secondary"}`}
          onClick={() => setTab("raw")}
        >
          <FileCode size={15} />
          <span>Éditeur brut snort.lua</span>
        </button>
      </div>

      {tab === "simple" ? (
        <div className="card" style={{ maxWidth: 780 }}>
          <div className="grid cols-2" style={{ gap: 16 }}>
            {/* HOME_NET */}
            <div className="field">
              <div className="flex items-center gap-1" style={{ marginBottom: 6 }}>
                <label style={{ margin: 0 }}>HOME_NET (Réseau interne à protéger)</label>
                <Tooltip text="Adresses IPv4 ou blocs CIDR considérés comme le réseau interne (ex: 192.168.1.0/24 ou 10.0.0.0/8).">
                  <HelpCircle size={13} color="var(--soc-text-muted)" style={{ cursor: "help" }} />
                </Tooltip>
              </div>
              <input
                type="text"
                className="mono"
                value={cfg.home_net || ""}
                onChange={(e) => setField("home_net", e.target.value)}
                placeholder="ex: 192.168.1.0/24 ou any"
              />
              {errors.home_net && <div className="field-error">{errors.home_net}</div>}
            </div>

            {/* EXTERNAL_NET */}
            <div className="field">
              <div className="flex items-center gap-1" style={{ marginBottom: 6 }}>
                <label style={{ margin: 0 }}>EXTERNAL_NET (Réseau extérieur)</label>
                <Tooltip text="Généralement configuré à !$HOME_NET ou any pour surveiller tout le trafic externe.">
                  <HelpCircle size={13} color="var(--soc-text-muted)" style={{ cursor: "help" }} />
                </Tooltip>
              </div>
              <input
                type="text"
                className="mono"
                value={cfg.external_net || ""}
                onChange={(e) => setField("external_net", e.target.value)}
                placeholder="ex: !$HOME_NET ou any"
              />
              {errors.external_net && <div className="field-error">{errors.external_net}</div>}
            </div>

            {/* Interface */}
            <div className="field">
              <div className="flex items-center gap-1" style={{ marginBottom: 6 }}>
                <label style={{ margin: 0 }}>Interface d'écoute réseau</label>
                <Tooltip text="Interface physique ou virtuelle écoutée par la DAQ (ex: eth0, ens33, enp3s0).">
                  <HelpCircle size={13} color="var(--soc-text-muted)" style={{ cursor: "help" }} />
                </Tooltip>
              </div>
              <input
                type="text"
                className="mono"
                value={cfg.interface || ""}
                onChange={(e) => setField("interface", e.target.value)}
                placeholder="ex: eth0"
              />
              {errors.interface && <div className="field-error">{errors.interface}</div>}
            </div>

            {/* Tuning Profile */}
            <div className="field">
              <div className="flex items-center gap-1" style={{ marginBottom: 6 }}>
                <label style={{ margin: 0 }}>Profil de Tuning Snort (--tweaks)</label>
                <Tooltip text="Ajuste automatiquement les préprocesseurs et seuils de détection selon vos priorités.">
                  <HelpCircle size={13} color="var(--soc-text-muted)" style={{ cursor: "help" }} />
                </Tooltip>
              </div>
              <select
                value={cfg.tweak_profile || "balanced"}
                onChange={(e) => setField("tweak_profile", e.target.value)}
              >
                {PROFILES.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Rules Path */}
          <div className="field">
            <div className="flex items-center gap-1" style={{ marginBottom: 6 }}>
              <label style={{ margin: 0 }}>Chemin absolu du fichier de règles locales</label>
              <Tooltip text="Emplacement de votre fichier local.rules sur l'appliance autonome.">
                <HelpCircle size={13} color="var(--soc-text-muted)" style={{ cursor: "help" }} />
              </Tooltip>
            </div>
            <input
              type="text"
              className="mono"
              value={cfg.rules_path || ""}
              onChange={(e) => setField("rules_path", e.target.value)}
              placeholder="/opt/ids-hybride/config/local.rules"
            />
          </div>

          {/* Alert JSON output toggle */}
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={Boolean(cfg.alert_json_enabled)}
                onChange={(e) => setField("alert_json_enabled", e.target.checked)}
                style={{ width: "auto" }}
              />
              <div>
                <span style={{ fontWeight: 600, color: "var(--soc-text-primary)" }}>
                  Activer le format de sortie JSON structuré (alert_json)
                </span>
                <div style={{ fontSize: 12, color: "var(--soc-text-secondary)" }}>
                  Indispensable pour l'affichage temps réel du Dashboard et l'ingestion SIEM / SOAR.
                </div>
              </div>
            </label>
          </div>

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--soc-border)" }}>
            <Button
              variant="primary"
              icon={<Save size={14} />}
              loading={saveBusy}
              onClick={saveSimple}
            >
              Enregistrer la configuration
            </Button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <FileCode size={16} color="var(--soc-accent)" />
              <span>Fichier Lua maître : <span className="mono" style={{ textTransform: "none", color: "var(--soc-text-primary)" }}>{raw?.path || "snort.lua"}</span></span>
            </h3>
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw size={13} />}
              onClick={() => {
                setRaw(null);
                api.getRawConfig().then(setRaw).catch(() => {});
              }}
            >
              Recharger
            </Button>
          </div>

          {raw === null ? (
            <LoadingSpinner message="Lecture du fichier snort.lua..." />
          ) : (
            <div>
              <textarea
                className="mono"
                style={{
                  minHeight: "55vh",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  background: "#05080e",
                  border: "1px solid #233452",
                  padding: 14
                }}
                value={raw.content}
                onChange={(e) => setRaw({ ...raw, content: e.target.value })}
              />

              <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
                <Button
                  variant="primary"
                  icon={<Save size={14} />}
                  loading={saveBusy}
                  onClick={saveRaw}
                >
                  Enregistrer snort.lua
                </Button>
                <span style={{ fontSize: 12, color: "var(--soc-text-muted)" }}>
                  Pensez à cliquer sur « Tester la syntaxe » après chaque modification de directives Lua.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {node}
    </div>
  );
}
