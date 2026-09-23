import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { login } from "../services/api";

export default function Login({ onDone }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const backendLive = Boolean(import.meta.env.VITE_BACKEND_URL);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      onDone();
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f8fb] flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={22} className="text-sky-700" />
          <span className="text-lg font-extrabold tracking-wide text-slate-900">SENTINEL</span>
        </div>
        <p className="text-[13px] text-slate-500 mb-5">Operator sign-in — voice defense console.</p>
        {!backendLive && (
          <div className="mb-3 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2">
            No backend configured — sign-in requires the API.
          </div>
        )}
        <label className="text-[11px] font-bold tracking-widest text-slate-500">EMAIL</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
          placeholder="operator@example.com"
          className="w-full border border-slate-300 px-3 py-2 text-[13px] mt-1 mb-3 outline-none focus:border-sky-500" />
        <label className="text-[11px] font-bold tracking-widest text-slate-500">PASSWORD</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
          placeholder="••••••••"
          className="w-full border border-slate-300 px-3 py-2 text-[13px] mt-1 mb-4 outline-none focus:border-sky-500" />
        {error && (
          <div className="mb-3 text-[12px] font-semibold text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</div>
        )}
        <button disabled={busy} className="w-full px-4 py-2.5 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-[13px] font-bold">
          {busy ? "SIGNING IN…" : "SIGN IN"}
        </button>
        <p className="text-[11px] text-slate-400 mt-3">Accounts are created by an admin in Supabase → Authentication → Users.</p>
      </form>
    </div>
  );
}
