import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "/";
const ACCESS_TOKEN_STORAGE_KEY = "helpdesk_access_token";

export const AuthContext = createContext(null);

const publicApi = axios.create({
  baseURL: API_URL,
  withCredentials: true
});

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch (_err) {
    return null;
  }
}

function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) {
    return true;
  }
  return payload.exp * 1000 <= Date.now();
}

function readStoredToken() {
  try {
    const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    if (!token) return null;
    if (isTokenExpired(token)) {
      localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
      return null;
    }
    return token;
  } catch (_err) {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(() => readStoredToken());
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
    try {
      if (token) {
        localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
      } else {
        localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
      }
    } catch (_err) {
      // best effort only
    }
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    persistAccessToken(null);
  }, [persistAccessToken]);

  const refreshAccessToken = useCallback(async () => {
    const response = await publicApi.post("/api/auth/refresh");
    const newToken = response.data.accessToken;
    persistAccessToken(newToken);
    return newToken;
  }, [persistAccessToken]);

  const restoreSession = useCallback(async () => {
    try {
      const token = await refreshAccessToken();
      await fetchMe(token);
    } catch (refreshErr) {
      const fallbackToken = readStoredToken();
      if (fallbackToken) {
        try {
          await fetchMe(fallbackToken);
          persistAccessToken(fallbackToken);
          return;
        } catch (_fallbackErr) {
          clearAuth();
        }
      } else {
        clearAuth();
      }

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

  const register = useCallback(
    async ({ firstName, lastName, email, password }) => {
      const response = await publicApi.post("/api/auth/register", {
        firstName,
        lastName,
        email,
        password
      });
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
      register,
      logout,
      refreshAccessToken,
      fetchMe,
      clearAuth
    }),
    [accessToken, clearAuth, fetchMe, initializing, login, logout, refreshAccessToken, register, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
