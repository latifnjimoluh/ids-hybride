import React, { useEffect, useState, useMemo } from "react";
import {
  Sliders,
  Plus,
  Download,
  Trash2,
  Edit3,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  RefreshCw,
  FolderInput,
  FileCode,
  Sparkles
} from "lucide-react";
import { api } from "../api.js";
import { useToast } from "../useToast.jsx";
import PageHeader from "../components/layout/PageHeader.jsx";
import DataTable from "../components/ui/DataTable.jsx";
import Modal from "../components/ui/Modal.jsx";
import ConfirmDialog from "../components/ui/ConfirmDialog.jsx";
import Badge from "../components/ui/Badge.jsx";
import Button from "../components/ui/Button.jsx";

const EMPTY_RULE = {
  action: "alert",
  proto: "tcp",
  source: "$EXTERNAL_NET",
  sport: "any",
  direction: "->",
  dest: "$HOME_NET",
  dport: "any",
  msg: "",
  raw: "",
};

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const { show, node } = useToast();

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [useRaw, setUseRaw] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_RULE);
  const [createBusy, setCreateBusy] = useState(false);

  // Edit Modal state
  const [editRule, setEditRule] = useState(null);
  const [editRaw, setEditRaw] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  // Delete Confirm state
  const [ruleToDelete, setRuleToDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Import busy state
  const [importBusy, setImportBusy] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.listRules().catch((e) => { show(e.message, "err"); return []; }),
      api.ruleCategories().catch(() => [])
    ]).then(([resRules, resCats]) => {
      setRules(resRules || []);
      setCategories(resCats || []);
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const doImport = async (name) => {
    setImportBusy(true);
    try {
      const res = await api.importRuleset(name);
      show(res.message || "Ruleset importé avec succès.");
      load();
    } catch (e) {
      show(e.message, "err");
    } finally {
      setImportBusy(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e?.preventDefault();
    setCreateBusy(true);
    try {
      const payload = useRaw
        ? { raw: createForm.raw, enabled: true }
        : { ...createForm, enabled: true };

      await api.createRule(payload);
      show("Règle créée avec succès ✓");
      setCreateForm(EMPTY_RULE);
      setIsCreateOpen(false);
      load();
    } catch (e) {
      show(e.message, "err");
    } finally {
      setCreateBusy(false);
    }
  };

  const handleToggle = async (r) => {
    try {
      await api.toggleRule(r.sid, !r.enabled);
      show(`Règle ${r.sid} ${!r.enabled ? "activée" : "désactivée"}`);
      load();
    } catch (e) {
      show(e.message, "err");
    }
  };

  const handleEditClick = (r) => {
    setEditRule(r);
    setEditRaw(r.raw || "");
  };

  const handleSaveEdit = async () => {
    if (!editRule) return;
    setEditBusy(true);
    try {
      await api.updateRule(editRule.sid, editRaw);
      show("Règle modifiée avec succès ✓");
      setEditRule(null);
      load();
    } catch (e) {
      show(e.message, "err");
    } finally {
      setEditBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!ruleToDelete) return;
    setDeleteBusy(true);
    try {
      await api.deleteRule(ruleToDelete.sid);
      show(`Règle SID ${ruleToDelete.sid} supprimée.`);
      setRuleToDelete(null);
      load();
    } catch (e) {
      show(e.message, "err");
    } finally {
      setDeleteBusy(false);
    }
  };

  const validateRuleset = async () => {
    try {
      const res = await api.validateRules();
      show(res.ok ? "Configuration Snort valide ✓" : "Erreurs de syntaxe détectées ✗", res.ok ? "ok" : "err");
    } catch (e) {
      show(e.message, "err");
    }
  };

  const columns = [
    {
      key: "enabled",
      label: "État",
      width: 90,
      render: (val, row) => (
        <button
          className="btn ghost sm"
          onClick={(e) => {
            e.stopPropagation();
            handleToggle(row);
          }}
          title={val ? "Désactiver la règle" : "Activer la règle"}
          style={{ padding: "2px 6px" }}
        >
          <Badge variant={val ? "success" : "neutral"} dot={val}>
            {val ? "Active" : "Inactive"}
          </Badge>
        </button>
      )
    },
    {
      key: "sid",
      label: "SID",
      width: 100,
      render: (val) => <span className="mono" style={{ fontWeight: 700, color: "var(--soc-accent)" }}>{val}</span>
    },
    {
      key: "action",
      label: "Action",
      width: 90,
      render: (val) => (
        <span
          className="badge mono"
          style={{
            background: val === "drop" ? "rgba(239, 68, 68, 0.15)" : "rgba(59, 130, 246, 0.15)",
            color: val === "drop" ? "#ef4444" : "#3b82f6"
          }}
        >
          {val}
        </span>
      )
    },
    {
      key: "proto",
      label: "Proto",
      width: 80,
      render: (val) => <span className="mono text-muted">{val}</span>
    },
    {
      key: "msg",
      label: "Message de la règle",
      render: (val) => <span style={{ fontWeight: 500 }}>{val || "—"}</span>
    },
    {
      key: "classtype",
      label: "Classe",
      width: 150,
      render: (val) => <span className="text-muted" style={{ fontSize: 12 }}>{val || "—"}</span>
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      width: 130,
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            icon={<Edit3 size={13} />}
            onClick={(e) => {
              e.stopPropagation();
              handleEditClick(row);
            }}
            title="Modifier la règle"
            style={{ padding: 4 }}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={13} color="#ef4444" />}
            onClick={(e) => {
              e.stopPropagation();
              setRuleToDelete(row);
            }}
            title="Supprimer la règle"
            style={{ padding: 4 }}
          />
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Règles de détection Snort"
        subtitle={`Gestion des signatures et des règles locales (local.rules) • ${rules.length} règles configurées`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              icon={<FolderInput size={14} color="#38bdf8" />}
              onClick={() => doImport("community")}
              loading={importBusy}
              title="Importer le ruleset officiel Snort Community"
            >
              + Community
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<FolderInput size={14} color="#f59e0b" />}
              onClick={() => doImport("emerging-threats")}
              loading={importBusy}
              title="Importer les règles Emerging Threats Open"
            >
              + ET Open
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<ShieldCheck size={14} color="#10b981" />}
              onClick={validateRuleset}
            >
              Valider la syntaxe
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setIsCreateOpen(true)}
            >
              Nouvelle règle
            </Button>
          </div>
        }
      />

      {/* Categories Bar */}
      {categories.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <Sparkles size={14} color="var(--soc-accent)" />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--soc-text-secondary)" }}>
              Catégories de menaces (classtype)
            </span>
          </div>
          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            {categories.map((c) => (
              <span
                key={c.name}
                className="badge neutral"
                style={{ fontSize: 11.5, background: "var(--soc-bg-elevated)", border: "1px solid var(--soc-border)" }}
              >
                {c.name} : <b style={{ color: "var(--soc-text-primary)", marginLeft: 3 }}>{c.enabled}</b>/{c.total}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rules DataTable with search and CSV/JSON export */}
      <DataTable
        columns={columns}
        data={rules}
        searchKeys={["msg", "sid", "proto", "action", "classtype"]}
        exportFilename="snort_rules"
        defaultSort={{ key: "sid", direction: "asc" }}
        emptyMessage="Aucune règle de détection trouvée."
      />

      {/* Create Rule Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Créer une nouvelle règle de détection"
        subtitle="Ajout d'une signature Snort dans le fichier local.rules"
        maxWidth={640}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateSubmit}
              loading={createBusy}
            >
              Enregistrer la règle
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", margin: 0 }}>
            <input
              type="checkbox"
              checked={useRaw}
              onChange={(e) => setUseRaw(e.target.checked)}
              style={{ width: "auto" }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--soc-text-primary)" }}>
              Mode saisie brute (syntaxe texte complète)
            </span>
          </label>
        </div>

        {useRaw ? (
          <div className="field">
            <label>Règle Snort 3 complète</label>
            <textarea
              className="mono"
              rows={4}
              placeholder='alert tcp $EXTERNAL_NET any -> $HOME_NET 80 ( msg:"Tentative HTTP suspecte"; sid:1000050; rev:1; )'
              value={createForm.raw}
              onChange={(e) => setCreateForm({ ...createForm, raw: e.target.value })}
            />
            <div style={{ fontSize: 11.5, color: "var(--soc-text-muted)", marginTop: 6 }}>
              Le numéro de SID sera attribué automatiquement par le backend s'il est omis.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid cols-2" style={{ gap: 12 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Action</label>
                <select
                  value={createForm.action}
                  onChange={(e) => setCreateForm({ ...createForm, action: e.target.value })}
                >
                  {["alert", "log", "drop", "reject", "pass"].map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label>Protocole</label>
                <select
                  value={createForm.proto}
                  onChange={(e) => setCreateForm({ ...createForm, proto: e.target.value })}
                >
                  {["tcp", "udp", "icmp", "ip", "http"].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid cols-2" style={{ gap: 12 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Réseau Source</label>
                <input
                  type="text"
                  value={createForm.source}
                  onChange={(e) => setCreateForm({ ...createForm, source: e.target.value })}
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label>Port Source</label>
                <input
                  type="text"
                  value={createForm.sport}
                  onChange={(e) => setCreateForm({ ...createForm, sport: e.target.value })}
                />
              </div>
            </div>

            <div className="grid cols-2" style={{ gap: 12 }}>
              <div className="field" style={{ margin: 0 }}>
                <label>Réseau Destination</label>
                <input
                  type="text"
                  value={createForm.dest}
                  onChange={(e) => setCreateForm({ ...createForm, dest: e.target.value })}
                />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label>Port Destination</label>
                <input
                  type="text"
                  value={createForm.dport}
                  onChange={(e) => setCreateForm({ ...createForm, dport: e.target.value })}
                />
              </div>
            </div>

            <div className="field" style={{ margin: 0 }}>
              <label>Message de détection (msg)</label>
              <input
                type="text"
                placeholder="ex: SCAN Nmap SYN Détecté"
                value={createForm.msg}
                onChange={(e) => setCreateForm({ ...createForm, msg: e.target.value })}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Rule Modal */}
      <Modal
        isOpen={Boolean(editRule)}
        onClose={() => setEditRule(null)}
        title={`Modifier la règle SID ${editRule?.sid}`}
        subtitle="Édition directe de la clause Snort 3"
        maxWidth={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditRule(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveEdit}
              loading={editBusy}
            >
              Enregistrer les modifications
            </Button>
          </>
        }
      >
        <div className="field">
          <label>Définition de la règle</label>
          <textarea
            className="mono"
            rows={5}
            value={editRaw}
            onChange={(e) => setEditRaw(e.target.value)}
          />
        </div>
      </Modal>

      {/* Delete Rule Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(ruleToDelete)}
        onClose={() => setRuleToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Supprimer la règle de détection"
        message={`Confirmez-vous la suppression irréversible de la règle SID ${ruleToDelete?.sid} (${ruleToDelete?.msg || "sans message"}) ?`}
        confirmText="Supprimer définitivement"
        danger={true}
        loading={deleteBusy}
      />

      {node}
    </div>
  );
}
