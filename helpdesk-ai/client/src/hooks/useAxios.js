import { useEffect, useMemo } from "react";
import axios from "axios";
import { useAuth } from "./useAuth";

const API_URL = import.meta.env.VITE_API_URL || "/";

export function useAxios() {
  const { accessToken, refreshAccessToken, clearAuth } = useAuth();

  const instance = useMemo(
    () =>
      axios.create({
        baseURL: API_URL,
        withCredentials: true
      }),
    []
  );

  useEffect(() => {
    const reqId = instance.interceptors.request.use((config) => {
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    });

    const resId = instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const original = error.config;
        if (
          error.response?.status === 401 &&
          !original?._retry &&
          !original?.url?.includes("/api/auth/refresh") &&
          !original?.url?.includes("/api/auth/login")
        ) {
          original._retry = true;
          try {
            const newToken = await refreshAccessToken();
            original.headers.Authorization = `Bearer ${newToken}`;
            return instance(original);
          } catch (_refreshError) {
            clearAuth();
            window.location.href = "/login";
          }
        }

        if (error.response?.status === 403) {
          window.location.href = "/dashboard?denied=1";
        }

        return Promise.reject(error);
      }
    );

    return () => {
      instance.interceptors.request.eject(reqId);
      instance.interceptors.response.eject(resId);
    };
  }, [accessToken, clearAuth, instance, refreshAccessToken]);

  return instance;
}
