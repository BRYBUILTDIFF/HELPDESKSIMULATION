import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const AuthContext = createContext(null);

const publicApi = axios.create({
  baseURL: API_URL,
  withCredentials: true
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [initializing, setInitializing] = useState(true);

  const fetchMe = useCallback(async (token) => {
    const response = await publicApi.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    setUser(response.data.user);
    return response.data.user;
  }, []);

  const clearAuth = useCallback(() => {
    setUser(null);
    setAccessToken(null);
  }, []);

  const refreshAccessToken = useCallback(async () => {
    const response = await publicApi.post("/api/auth/refresh");
    const newToken = response.data.accessToken;
    setAccessToken(newToken);
    return newToken;
  }, []);

  const restoreSession = useCallback(async () => {
    try {
      const token = await refreshAccessToken();
      await fetchMe(token);
    } catch (_err) {
      clearAuth();
    } finally {
      setInitializing(false);
    }
  }, [clearAuth, fetchMe, refreshAccessToken]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(
    async ({ email, password }) => {
      const response = await publicApi.post("/api/auth/login", { email, password });
      setAccessToken(response.data.accessToken);
      setUser(response.data.user);
      return response.data.user;
    },
    []
  );

  const register = useCallback(
    async ({ firstName, lastName, email, password }) => {
      const response = await publicApi.post("/api/auth/register", {
        firstName,
        lastName,
        email,
        password
      });
      setAccessToken(response.data.accessToken);
      setUser(response.data.user);
      return response.data.user;
    },
    []
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
