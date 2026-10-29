import React from "react";
import { AlertTriangle, Info } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirmation",
  message = "Êtes-vous sûr de vouloir effectuer cette action ?",
  confirmText = "Confirmer",
  cancelText = "Annuler",
  danger = true,
  loading = false
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex gap-3" style={{ alignItems: "flex-start" }}>
        <div
          style={{
            padding: 8,
            borderRadius: "50%",
            background: danger ? "rgba(239, 68, 68, 0.15)" : "rgba(59, 130, 246, 0.15)",
            color: danger ? "#ef4444" : "#3b82f6",
            flexShrink: 0
          }}
        >
          {danger ? <AlertTriangle size={22} /> : <Info size={22} />}
        </div>
        <div style={{ flex: 1, fontSize: 13.5, color: "var(--soc-text-primary)", lineHeight: 1.5 }}>
          {message}
        </div>
      </div>
    </Modal>
  );
}
