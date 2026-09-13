import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

export default function Login() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setNotice("");
    if (!email.trim() || !password) return setError("Ingresa tu correo y contraseña.");
    if (mode === "register" && !name.trim()) return setError("Ingresa tu nombre.");

    setBusy(true);
    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
      } else {
        const active = await signUp(name.trim(), email.trim(), password);
        if (!active) { setNotice("Revisa tu correo para confirmar la cuenta. Después podrás iniciar sesión."); setMode("login"); return; }
      }
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10">
      <div className="grid w-full max-w-[880px] grid-cols-1 overflow-hidden rounded-[24px] border border-[#EAEAEA] bg-card shadow-[0_20px_60px_rgba(0,0,0,0.06)] md:grid-cols-2">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-brand p-10 md:flex">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
          <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-white/5" />
          <div className="relative">
            <span className="inline-flex items-center rounded-2xl bg-white px-5 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.2)]">
              <img src="/logo-sonacol.png" alt="SONACOL" className="h-6 w-auto" />
            </span>
          </div>
          <div className="relative">
            <p className="text-[24px] font-bold leading-snug text-white">
              Liquidez, flujo de caja
              <br />
              e inversiones en un solo lugar.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-white/75">
              Posición consolidada, proyecciones diarias, cobros, pagos y rescates con
              datos persistentes y auditoría de cada acción.
            </p>
            <div className="mt-6 flex items-center gap-2 text-[12px] font-medium text-white/85">
              <ShieldCheck className="h-4 w-4" />
              Acceso por roles: Administrador · Tesorería · Contabilidad · Consulta
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-col justify-center p-8 md:p-10">
          <div className="mb-8 md:hidden">
            <img src="/logo-sonacol.png" alt="SONACOL" className="h-8 w-auto" />
          </div>

          <h1 className="text-[24px] font-bold tracking-tight text-foreground">
            {mode === "login" ? "Bienvenido de nuevo" : "Crear cuenta"}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {mode === "login"
              ? "Ingresa con tu cuenta de tesorería."
              : "Las cuentas nuevas tienen acceso de consulta. Un administrador puede asignar otros permisos."}
          </p>

          {notice && <p role="status" className="mt-4 rounded-xl bg-success-soft p-3 text-sm text-success">{notice}</p>}
          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            {mode === "register" && (
              <Field icon={User} label="Nombre">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className="t-input w-full pl-9"
                />
              </Field>
            )}
            <Field icon={Mail} label="Correo">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tesoreria@sonacol.cl"
                className="t-input w-full pl-9"
              />
            </Field>
            <Field icon={Lock} label="Contraseña">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="t-input w-full pl-9"
              />
            </Field>

            {error && (
              <p className="rounded-xl bg-danger-soft px-3 py-2 text-[12px] font-medium text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className={cn(
                "mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand text-[14px] font-semibold text-white transition-all hover:bg-brand-dark disabled:opacity-60",
              )}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {mode === "login" ? "Ingresar" : "Crear cuenta"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            className="mt-5 text-center text-[13px] font-medium text-muted-foreground transition-colors hover:text-brand"
          >
            {mode === "login"
              ? "¿No tienes cuenta? Créala aquí"
              : "¿Ya tienes cuenta? Inicia sesión"}
          </button>

          <p className="mt-6 border-t border-[#F1F1F1] pt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            Acceso a información financiera interna. Usa tu cuenta autorizada.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof Mail;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        {children}
      </div>
    </label>
  );
}
