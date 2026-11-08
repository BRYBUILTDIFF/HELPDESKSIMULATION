import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/";
let pendingRefresh = null;
// Remove tokens persisted by older versions.
try { localStorage.removeItem("helpdesk_access_token"); } catch (_) {}

export const AuthContext = createContext(null);

const publicApi = axios.create({
  baseURL: API_URL,
  withCredentials: true
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const restoreStartedRef = useRef(false);

  const fetchMe = useCallback(async (token) => {
    const response = await publicApi.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    setUser(response.data.user);
    return response.data.user;
  }, []);

  const persistAccessToken = useCallback((token) => {
    setAccessToken(token);

  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    persistAccessToken(null);
  }, [persistAccessToken]);

  const refreshAccessToken = useCallback(async () => {
    if (!pendingRefresh) {
      const refresh = () => publicApi.post("/api/auth/refresh");
      pendingRefresh = (navigator.locks ? navigator.locks.request("helpdesk-session-refresh", refresh) : refresh()).finally(() => { pendingRefresh = null; });
    }
    const response = await pendingRefresh;
    const newToken = response.data.accessToken;
    persistAccessToken(newToken);
    return newToken;
  }, [persistAccessToken]);

  const restoreSession = useCallback(async () => {
    try {
      const token = await refreshAccessToken();
      await fetchMe(token);
    } catch (refreshErr) {
      clearAuth();

      if (import.meta.env.DEV) {
        const status = refreshErr?.response?.status;
        console.warn(
          "[Auth] Session refresh failed. This can be caused by missing/blocked refresh cookie, origin mismatch, or auth rate limiting (429).",
          { status, apiUrl: API_URL, currentOrigin: window.location.origin }
        );
      }
    } finally {
      setInitializing(false);
    }
  }, [clearAuth, fetchMe, persistAccessToken, refreshAccessToken]);

  useEffect(() => {
    if (restoreStartedRef.current) {
      return;
    }
    restoreStartedRef.current = true;
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(
    async ({ email, password }) => {
      const response = await publicApi.post("/api/auth/login", { email, password });
      persistAccessToken(response.data.accessToken);
      setUser(response.data.user);
      return response.data.user;
    },
    [persistAccessToken]
  );

  const logout = useCallback(async () => {
    try {
      await publicApi.post("/api/auth/logout");
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      initializing,
      login,
      logout,
      refreshAccessToken,
      fetchMe,
      clearAuth
    }),
    [accessToken, clearAuth, fetchMe, initializing, login, logout, refreshAccessToken, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
