import React from "react";

export default function StatCard({
  label,
  value,
  sub,
  icon,
  color = "accent",
  onClick = null,
  className = "",
  style = {}
}) {
  const isClickable = typeof onClick === "function";

  const colorStyles = {
    accent: { iconBg: "rgba(59, 130, 246, 0.15)", iconColor: "#3b82f6", border: "#24334f" },
    danger: { iconBg: "rgba(239, 68, 68, 0.15)", iconColor: "#ef4444", border: "rgba(239, 68, 68, 0.3)" },
    warning: { iconBg: "rgba(245, 158, 11, 0.15)", iconColor: "#f59e0b", border: "rgba(245, 158, 11, 0.3)" },
    success: { iconBg: "rgba(16, 185, 129, 0.15)", iconColor: "#10b981", border: "rgba(16, 185, 129, 0.3)" },
    info: { iconBg: "rgba(56, 189, 248, 0.15)", iconColor: "#38bdf8", border: "rgba(56, 189, 248, 0.3)" },
  };

  const scheme = colorStyles[color] || colorStyles.accent;

  return (
    <div
      className={`statcard ${className}`}
      onClick={onClick}
      style={{
        cursor: isClickable ? "pointer" : "default",
        borderColor: scheme.border,
        ...style
      }}
    >
      <div className="statcard-header">
        <span className="statcard-label">{label}</span>
        {icon && (
          <div className="statcard-icon" style={{ background: scheme.iconBg, color: scheme.iconColor }}>
            {icon}
          </div>
        )}
      </div>
      <div className="statcard-value" style={{ color: color === "danger" ? "#ef4444" : "var(--soc-text-primary)" }}>
        {value ?? "—"}
      </div>
      {sub && <div className="statcard-sub">{sub}</div>}
    </div>
  );
}
