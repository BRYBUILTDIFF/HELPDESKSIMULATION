import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function validate(values) {
  return {
    firstName: values.firstName.trim() ? "" : "First name is required.",
    lastName: values.lastName.trim() ? "" : "Last name is required.",
    email: EMAIL_REGEX.test(values.email) ? "" : "Enter a valid email address.",
    password: PASSWORD_REGEX.test(values.password)
      ? ""
      : "Minimum 8 chars, 1 uppercase, 1 number, 1 special character.",
    confirmPassword:
      values.confirmPassword && values.confirmPassword === values.password ? "" : "Passwords do not match."
  };
}

function parseError(error) {
  if (!error.response) {
    return "Connection error. Please try again.";
  }
  if (error.response.status === 409) {
    return "An account with this email already exists.";
  }
  return "Unable to register. Please try again.";
}

export default function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");

  const errors = useMemo(() => validate(values), [values]);
  const isValid = useMemo(
    () =>
      Object.values(errors).every((err) => !err) &&
      Object.values(values).every((value) => value.trim().length > 0),
    [errors, values]
  );

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const onChange = (e) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || loading) {
      return;
    }
    setLoading(true);
    setGlobalError("");
    try {
      await register({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setGlobalError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">Get access to HelpDesk AI support workflows.</p>

        {globalError ? <p className="global-error">{globalError}</p> : null}

        <div className="field">
          <label htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" value={values.firstName} onChange={onChange} />
          {errors.firstName ? <p className="error">{errors.firstName}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" value={values.lastName} onChange={onChange} />
          {errors.lastName ? <p className="error">{errors.lastName}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" value={values.email} onChange={onChange} />
          {errors.email ? <p className="error">{errors.email}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" value={values.password} onChange={onChange} />
          {errors.password ? <p className="error">{errors.password}</p> : null}
        </div>

        <div className="field">
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={values.confirmPassword}
            onChange={onChange}
          />
          {errors.confirmPassword ? <p className="error">{errors.confirmPassword}</p> : null}
        </div>

        <button className="btn" type="submit" disabled={!isValid || loading}>
          {loading ? "Creating account..." : "Register"}
        </button>

        <p className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
