import React from "react";

export default function PageHeader({
  title,
  icon = null,
  subtitle = null,
  badge = null,
  actions = null,
  breadcrumb = null,
  className = ""
}) {
  return (
    <div className={`page-header ${className}`}>
      <div className="page-header-info">
        {breadcrumb && (
          <div style={{ fontSize: 12, color: "var(--soc-text-muted)", marginBottom: 4 }}>
            {breadcrumb}
          </div>
        )}
        <div className="flex items-center gap-3">
          <h1 className="page-title">
            {icon && <span style={{ display: "flex", alignItems: "center", color: "var(--soc-accent)" }}>{icon}</span>}
            <span>{title}</span>
          </h1>
          {badge}
        </div>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>

      {actions && (
        <div className="page-header-actions">
          {actions}
        </div>
      )}
    </div>
  );
}
