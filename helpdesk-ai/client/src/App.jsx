import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import PrivateRoute from "./components/PrivateRoute";
import AdminRoute from "./components/AdminRoute";
import LoginPage from "./pages/users/LoginPage";
import RegisterPage from "./pages/users/RegisterPage";
import DashboardPage from "./pages/users/DashboardPage";
import AdminPage from "./pages/admin/AdminPage";
import NotFoundPage from "./pages/users/NotFoundPage";

function PublicOnly({ children }) {
  const { user, initializing } = useAuth();
  if (initializing) {
    return <div className="auth-shell">Loading session...</div>;
  }
  return user ? <Navigate to="/dashboard" replace /> : children;
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
      <Route
        path="/register"
        element={
          <PublicOnly>
            <RegisterPage />
          </PublicOnly>
        }
      />

      <Route element={<PrivateRoute />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Route>

      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
