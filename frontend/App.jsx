import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const authHeader = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user") || "null"));

  const logout = () => {
    localStorage.clear();
    setToken(null);
    setUser(null);
  };

  if (!token || !user) return <AuthPage setToken={setToken} setUser={setUser} />;
  return <Dashboard token={token} user={user} logout={logout} />;
}

/* ---------------- Auth ---------------- */
function AuthPage({ setToken, setUser }) {
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "donor", phone: "" });
  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setInfo("");
    try {
      if (isLogin) {
        const { data } = await axios.post(`${API}/login`, { email: form.email, password: form.password });
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      } else {
        await axios.post(`${API}/register`, form);
        setInfo("Registered! Please log in.");
        setIsLogin(true);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    }
  };

  return (
    <div className="container" style={{ maxWidth: 380 }}>
      <h2>🍲 Food Waste Reduction</h2>
      <form className="card" onSubmit={submit}>
        <h3>{isLogin ? "Login" : "Register"}</h3>
        {!isLogin && (
          <>
            <input name="name" placeholder="Name / Organization" onChange={onChange} required />
            <input name="phone" placeholder="Phone" onChange={onChange} />
            <select name="role" onChange={onChange} value={form.role}>
              <option value="donor">Donor (Hotel / Event / Caterer)</option>
              <option value="receiver">Receiver (NGO / Volunteer)</option>
            </select>
          </>
        )}
        <input name="email" type="email" placeholder="Email" onChange={onChange} required />
        <input name="password" type="password" placeholder="Password (min 6)" onChange={onChange} required />
        {error && <div className="error">{error}</div>}
        {info && <div>{info}</div>}
        <button type="submit">{isLogin ? "Login" : "Register"}</button>
        <a href="#" onClick={(e) => { e.preventDefault(); setIsLogin(!isLogin); }}>
          {isLogin ? "New user? Register" : "Have an account? Login"}
        </a>
      </form>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard({ token, user, logout }) {
  const [tab, setTab] = useState(user.role === "donor" ? "post" : "available");
  const [stats, setStats] = useState({ donations: 0, servingsSaved: 0 });

  useEffect(() => {
    axios.get(`${API}/stats`).then((r) => setStats(r.data)).catch(() => {});
  }, [tab]);

  return (
    <div className="container">
      <div className="header">
        <h2>🍲 Food Waste Reduction</h2>
        <div>
          {user.name} ({user.role}) <button className="secondary" onClick={logout}>Logout</button>
        </div>
      </div>

      <div className="stats">
        <div><b>{stats.servingsSaved}</b><br />servings saved</div>
        <div><b>{stats.donations}</b><br />donations completed</div>
      </div>

      <div className="tabs">
        {user.role === "donor" && (
          <button className={tab === "post" ? "active" : ""} onClick={() => setTab("post")}>Post Food</button>
        )}
        <button className={tab === "available" ? "active" : ""} onClick={() => setTab("available")}>Available Food</button>
        <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>
          {user.role === "donor" ? "My Posts" : "My Claims"}
        </button>
      </div>

      {tab === "post" && <PostFood token={token} onDone={() => setTab("mine")} />}
      {tab === "available" && <FoodList token={token} user={user} mode="available" />}
      {tab === "mine" && <FoodList token={token} user={user} mode="mine" />}
    </div>
  );
}

/* ---------------- Post food ---------------- */
function PostFood({ token, onDone }) {
  const empty = { title: "", quantity: "", servings: "", description: "", pickupAddress: "", expiryTime: "" };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await axios.post(`${API}/food`, { ...form, servings: Number(form.servings) || 0 }, authHeader(token));
      setForm(empty);
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || "Error posting food");
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3>Post Surplus Food</h3>
      <input name="title" placeholder="Food (e.g. Veg Biryani)" value={form.title} onChange={onChange} required />
      <input name="quantity" placeholder="Quantity (e.g. 40 plates)" value={form.quantity} onChange={onChange} required />
      <input name="servings" type="number" min="0" placeholder="Approx. number of servings (e.g. 40)" value={form.servings} onChange={onChange} />
      <textarea name="description" placeholder="Description (veg/non-veg, packed or not...)" value={form.description} onChange={onChange} />
      <input name="pickupAddress" placeholder="Pickup address" value={form.pickupAddress} onChange={onChange} required />
      <label>Safe to consume before:</label>
      <input name="expiryTime" type="datetime-local" value={form.expiryTime} onChange={onChange} required />
      {error && <div className="error">{error}</div>}
      <button type="submit">Post</button>
    </form>
  );
}

/* ---------------- Food list ---------------- */
function FoodList({ token, user, mode }) {
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = mode === "available" ? `${API}/food` : `${API}/food/mine`;
      const { data } = await axios.get(url, authHeader(token));
      setFoods(data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load food");
    } finally {
      setLoading(false);
    }
  }, [token, mode]);

  useEffect(() => { load(); }, [load]);

  const act = async (method, path) => {
    setError("");
    try {
      await axios({ method, url: `${API}/food/${path}`, ...authHeader(token) });
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Action failed");
    }
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {foods.length === 0 && <p>Nothing here yet.</p>}
      {foods.map((f) => (
        <div className="card" key={f._id}>
          <div className="header">
            <b>{f.title}</b>
            <span className={`badge ${f.status}`}>{f.status}</span>
          </div>
          <div>{f.quantity}{f.servings ? ` (~${f.servings} servings)` : ""}</div>
          {f.description && <p>{f.description}</p>}
          <div>📍 {f.pickupAddress}</div>
          <div>⏰ Use before: {new Date(f.expiryTime).toLocaleString()}</div>
          <div>
            Donor: {f.donor?.name} {f.donor?.phone && `(${f.donor.phone})`}
          </div>
          {f.claimedBy && <div>Claimed by: {f.claimedBy.name} {f.claimedBy.phone && `(${f.claimedBy.phone})`}</div>}

          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            {user.role === "receiver" && f.status === "available" && (
              <button onClick={() => act("put", `${f._id}/claim`)}>Claim</button>
            )}
            {user.role === "receiver" && f.status === "claimed" && mode === "mine" && (
              <button onClick={() => act("put", `${f._id}/collect`)}>Mark Collected</button>
            )}
            {user.role === "donor" && f.status === "available" && mode === "mine" && (
              <button className="danger" onClick={() => act("delete", f._id)}>Delete</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
