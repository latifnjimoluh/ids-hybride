import React, { useState } from "react";

export default function Tooltip({ text, children, position = "top", className = "" }) {
  const [visible, setVisible] = useState(false);

  if (!text) return children;

  const positionStyles = {
    top: { bottom: "100%", top: "auto", left: "50%", right: "auto", transform: "translateX(-50%) translateY(-6px)" },
    bottom: { top: "100%", bottom: "auto", left: "50%", right: "auto", transform: "translateX(-50%) translateY(6px)" },
    "bottom-left": { top: "100%", bottom: "auto", right: "0", left: "auto", transform: "translateY(6px)" },
    "bottom-right": { top: "100%", bottom: "auto", left: "0", right: "auto", transform: "translateY(6px)" },
    right: { left: "100%", right: "auto", top: "50%", bottom: "auto", transform: "translateY(-50%) translateX(6px)" },
    left: { right: "100%", left: "auto", top: "50%", bottom: "auto", transform: "translateY(-50%) translateX(-6px)" },
  };

  return (
    <div
      className={`soc-tooltip-wrapper ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      style={{ display: "inline-flex", position: "relative" }}
    >
      {children}
      {visible && (
        <div
          className="soc-tooltip-popup"
          style={positionStyles[position] || positionStyles.top}
        >
          {text}
        </div>
      )}
    </div>
  );
}
