import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { authApi } from "../utils/api";
import { setAuth, isAuthenticated } from "../utils/auth";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated()) navigate("/dashboard", { replace: true });
  }, [navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await authApi.login(username, password);
      setAuth(res.data.token, res.data.user);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || "Login failed. Check credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">
          <span className="icon"><ShieldCheck size={36} /></span>
          <h1>Shadow IT Detection</h1>
          <p>AI-Driven Security Framework &mdash; UMaT</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={submit}>
          <div className="form-group">
            <label>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="admin" required autoFocus />
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <div className="login-hint">
          Default: <code>admin / admin123</code> &nbsp;|&nbsp; <code>viewer / viewer123</code>
        </div>
      </div>
    </div>
  );
};

export default Login;
