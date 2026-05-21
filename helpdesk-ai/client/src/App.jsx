import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import PrivateRoute from "./components/PrivateRoute";
import AdminRoute from "./components/AdminRoute";
import LoginPage from "./pages/users/LoginPage";
import DashboardPage from "./pages/users/DashboardPage";
import SimulationsPage from "./pages/users/SimulationsPage";
import AdminPage from "./pages/admin/AdminPage";
import NotFoundPage from "./pages/users/NotFoundPage";

function PublicOnly({ children }) {
  const { user, initializing } = useAuth();
  if (initializing) {
    return <div className="auth-shell">Loading session...</div>;
  }
  if (user) {
    return <Navigate to={user.role === "ADMIN" ? "/admin" : "/dashboard"} replace />;
  }
  return children;
}

function UserOnly({ children }) {
  const { user, initializing } = useAuth();
  if (initializing) {
    return <div className="auth-shell">Loading session...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === "ADMIN") {
    return <Navigate to="/admin" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route path="/register" element={<Navigate to="/login" replace />} />

      <Route element={<PrivateRoute />}>
        <Route
          path="/"
          element={<RoleHomeRedirect />}
        />
        <Route
          path="/dashboard"
          element={(
            <UserOnly>
              <DashboardPage />
            </UserOnly>
          )}
        />
        <Route
          path="/simulations"
          element={(
            <UserOnly>
              <SimulationsPage />
            </UserOnly>
          )}
        />
      </Route>

      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

function RoleHomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === "ADMIN" ? "/admin" : "/dashboard"} replace />;
}
