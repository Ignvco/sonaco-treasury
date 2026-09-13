/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL, type UserRole } from "@/financial-engine/types";
export interface AuthUser { id: string; email: string; name: string; role: UserRole; }
interface AuthContextValue {
  user: AuthUser | null; loading: boolean; error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);
async function fetchProfile(id: string): Promise<AuthUser> {
  const { data, error } = await (supabase as any).from("profiles").select("id,email,name,role").eq("id", id).maybeSingle();
  if (error) throw new Error("No se pudo cargar tu perfil. Revisa la conexión e intenta nuevamente.");
  if (!data) throw new Error("Tu cuenta no tiene un perfil de acceso. Solicita al administrador que revise tu alta.");
  return { id: data.id, email: data.email ?? "", name: data.name || data.email || "Usuario", role: data.role ?? "consulta" };
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    let alive = true;
    const load = async (id?: string) => {
      const ticket = ++revision.current;
      if (!id) { if (alive) { setUser(null); setError(null); setLoading(false); } return; }
      try { const profile = await fetchProfile(id); if (alive && ticket === revision.current) { setUser(profile); setError(null); } }
      catch (e) { if (alive && ticket === revision.current) { setUser(null); setError(e instanceof Error ? e.message : "No se pudo cargar la sesión."); } }
      finally { if (alive && ticket === revision.current) setLoading(false); }
    };
    const startRevision = revision.current;
    void supabase.auth.getSession().then(({ data, error: err }) => {
      if (!alive || revision.current !== startRevision) return;
      if (err) { setError(err.message); setLoading(false); return; }
      void load(data.session?.user.id);
    }).catch(() => { if (alive) { setError("No se pudo recuperar tu sesión."); setLoading(false); } });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") { revision.current++; setUser(null); setError(null); setLoading(false); return; }
      // Supabase calls cannot run while its auth callback holds the session lock.
      setTimeout(() => { if (alive) void load(session?.user.id); }, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);
  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error("No se pudo iniciar sesión. Verifica tus credenciales y la conexión.");
    setLoading(true);
    try { const profile = await fetchProfile(data.user.id); revision.current++; setUser(profile); setError(null); }
    finally { setLoading(false); }
  }, []);
  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (error) throw new Error(error.message);
    return !!data.session;
  }, []);
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error("No se pudo cerrar sesión. Inténtalo nuevamente.");
    revision.current++; setUser(null); setError(null);
  }, []);
  const value = useMemo(() => ({ user, loading, error, signIn, signUp, signOut }), [user, loading, error, signIn, signUp, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue { const ctx = useContext(AuthContext); if (!ctx) throw new Error("useAuth must be used within AuthProvider"); return ctx; }
export function roleLabel(role: UserRole): string { return ROLE_LABEL[role] ?? role; }
export function useCanWrite(): boolean { const { user } = useAuth(); return user?.role === "administrador" || user?.role === "tesoreria"; }
