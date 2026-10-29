import React, { useEffect } from "react";
import { X } from "lucide-react";
import Button from "./Button";

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle = null,
  children,
  footer = null,
  maxWidth = 600,
  className = ""
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-content ${className}`}
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{title}</h3>
            {subtitle && (
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--soc-text-secondary)" }}>
                {subtitle}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Fermer"
            style={{ padding: 4 }}
          >
            <X size={18} />
          </Button>
        </div>

        <div className="modal-body">
          {children}
        </div>

        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
