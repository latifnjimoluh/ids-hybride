import React, { useEffect } from "react";
import { X } from "lucide-react";
import Button from "./Button";

export default function Drawer({
  isOpen,
  onClose,
  title,
  subtitle = null,
  children,
  width = 560,
  footer = null,
  className = ""
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div
        className={`drawer-panel ${className}`}
        style={{ width, maxWidth: "90vw" }}
        role="dialog"
        aria-modal="true"
      >
        <div className="drawer-header">
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--soc-text-primary)" }}>
              {title}
            </h3>
            {subtitle && (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--soc-text-secondary)" }}>
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

        <div className="drawer-body">
          {children}
        </div>

        {footer && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid var(--soc-border)", background: "rgba(11, 17, 28, 0.5)" }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
