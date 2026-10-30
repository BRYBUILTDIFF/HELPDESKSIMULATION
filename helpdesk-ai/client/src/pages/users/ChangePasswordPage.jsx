import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useAxios } from "../../hooks/useAxios";

export default function ChangePasswordPage() {
  const api = useAxios();
  const { refreshAccessToken, fetchMe } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("confirmPassword")) return setError("Passwords do not match.");
    setBusy(true);
    setError("");
    try {
      await api.post("/api/auth/change-password", { currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") });
      const token = await refreshAccessToken();
      await fetchMe(token);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to change password. Please try again.");
    } finally { setBusy(false); }
  }
  return <main className="auth-shell"><form className="required-password-form" onSubmit={submit}>
    <h1>Set your password</h1>
    <p>Choose a new password before continuing. Use at least 8 characters, an uppercase letter, a number, and a special character.</p>
    <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
    <label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
    <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
    {error && <p role="alert">{error}</p>}
    <button disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
  </form></main>;
}
