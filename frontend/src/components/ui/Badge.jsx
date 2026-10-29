import React from "react";

export default function Badge({
  variant = "neutral",
  dot = false,
  children,
  className = "",
  style = {}
}) {
  // Normalize variant
  let vClass = "neutral";
  if (variant === 1 || variant === "1" || variant === "prio-1" || variant === "critical" || variant === "danger") {
    vClass = "prio-1";
  } else if (variant === 2 || variant === "2" || variant === "prio-2" || variant === "warning") {
    vClass = "prio-2";
  } else if (variant === 3 || variant === "3" || variant === "prio-3" || variant === "info") {
    vClass = "prio-3";
  } else if (variant === "success" || variant === "on" || variant === true) {
    vClass = "success";
  } else if (variant === "neutral" || variant === "off" || variant === false) {
    vClass = "neutral";
  }

  return (
    <span className={`badge ${vClass} ${className}`} style={style}>
      {dot && (
        <span
          className={vClass === "success" ? "dot-live" : vClass === "prio-1" ? "dot-dead" : "dot"}
          style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", marginRight: 4 }}
        />
      )}
      {children}
    </span>
  );
}
