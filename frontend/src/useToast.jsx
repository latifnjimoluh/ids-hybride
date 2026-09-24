import { useCallback, useState } from "react";

// Petit hook de notification (toast) réutilisable.
export function useToast() {
  const [toast, setToast] = useState(null);

  const show = useCallback((message, kind = "ok") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const node = toast ? <div className={`toast ${toast.kind}`}>{toast.message}</div> : null;
  return { show, node };
}
