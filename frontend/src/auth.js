// Gestion de la session (token JWT en localStorage).

const KEY = "ids_token";
const USER = "ids_user";

export const auth = {
  get token() {
    return localStorage.getItem(KEY);
  },
  get username() {
    return localStorage.getItem(USER);
  },
  isAuthenticated() {
    return !!localStorage.getItem(KEY);
  },
  async login(username, password) {
    // Le endpoint OAuth2 attend un form-urlencoded.
    const body = new URLSearchParams({ username, password });
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.detail || "Échec de connexion");
    }
    const data = await res.json();
    localStorage.setItem(KEY, data.access_token);
    localStorage.setItem(USER, data.username);
    return data;
  },
  logout() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(USER);
    window.location.reload();
  },
};
