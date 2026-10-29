import React from "react";
import { Loader2 } from "lucide-react";

export default function LoadingSpinner({
  size = 24,
  message = null,
  full = false,
  className = ""
}) {
  const content = (
    <div
      className={`flex items-center gap-2 ${className}`}
      style={{
        flexDirection: full ? "column" : "row",
        justifyContent: "center",
        padding: full ? "40px 20px" : "8px 0"
      }}
    >
      <Loader2
        size={size}
        style={{
          animation: "soc-spin 0.8s linear infinite",
          color: "var(--soc-accent)"
        }}
      />
      {message && (
        <span
          style={{
            color: "var(--soc-text-secondary)",
            fontSize: full ? "13px" : "12px",
            marginTop: full ? 8 : 0
          }}
        >
          {message}
        </span>
      )}
    </div>
  );

  return content;
}
