import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function AdminRoute() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return <div className="auth-shell">Loading session...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "ADMIN") {
    return <Navigate to="/dashboard?denied=1" replace />;
  }

  return <Outlet />;
}
