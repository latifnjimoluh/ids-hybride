import React from "react";
import { Loader2 } from "lucide-react";

export default function Button({
  children,
  variant = "secondary",
  size = "md",
  loading = false,
  disabled = false,
  icon = null,
  iconRight = null,
  className = "",
  type = "button",
  onClick,
  ...rest
}) {
  const sizeClass = size === "sm" ? "sm" : size === "lg" ? "lg" : "";
  const variantClass = variant;

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled || loading}
      onClick={onClick}
      {...rest}
    >
      {loading ? (
        <Loader2 size={size === "sm" ? 13 : 15} style={{ animation: "soc-spin 0.8s linear infinite" }} />
      ) : (
        icon
      )}
      {children}
      {!loading && iconRight}
    </button>
  );
}
