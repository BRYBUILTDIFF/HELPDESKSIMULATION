import { useEffect, useMemo } from "react";
import axios from "axios";
import { useAuth } from "./useAuth";
import { getAdminVerification, setAdminVerification } from '../utils/adminVerification';

const API_URL = import.meta.env.VITE_API_URL || "/";

export function useAxios() {
  const { accessToken, refreshAccessToken, clearAuth, user } = useAuth();

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
      const proof = getAdminVerification(user?.id);
      if (proof && (config.url?.startsWith('/api/admin') || config.url?.startsWith('/api/auth/admin-mfa'))) config.headers['X-Admin-Verification'] = proof;
      if (accessToken && !config._retry) {
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

        if (error.response?.data?.code === "PASSWORD_CHANGE_REQUIRED") {
          window.location.href = "/change-password";
          return Promise.reject(error);
        }
        if (['ADMIN_MFA_REQUIRED','ADMIN_STEP_UP_REQUIRED'].includes(error.response?.data?.code)) {
          setAdminVerification(user?.id, '');
          window.dispatchEvent(new CustomEvent('admin-verification-required', {detail:error.response.data.message}));
          return Promise.reject(error);
        }
        if (error.response?.status === 403 && !original?.url?.startsWith('/api/auth/admin-mfa')) {
          window.location.href = user?.role === "ADMIN" ? "/admin?denied=1" : "/dashboard?denied=1";
        }

        return Promise.reject(error);
      }
    );

    return () => {
      instance.interceptors.request.eject(reqId);
      instance.interceptors.response.eject(resId);
    };
  }, [accessToken, clearAuth, instance, refreshAccessToken, user?.role, user?.id]);

  return instance;
}
