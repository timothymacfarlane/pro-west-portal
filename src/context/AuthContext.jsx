import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

// Normalise roles to match DB + app logic: "admin" | "basic"
function normalizeRole(role) {
  const r = String(role || "").trim().toLowerCase();
  return r === "admin" ? "admin" : "basic";
}

function buildFallbackProfile(user) {
  const fallbackName = user?.user_metadata?.full_name ?? user?.email ?? "User";

  return {
    id: user?.id ?? null,
    // ✅ new canonical field
    display_name: fallbackName,
    // ✅ keep for legacy code (safe to remove later once you’ve migrated everything)
    full_name: fallbackName,
    role: "basic",
    is_active: true,
    mobile: "",
    job_title: "",
  };
}


// Helper: promise timeout wrapper
async function withTimeout(promise, ms, label = "operation") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Supabase auth user
  const [profile, setProfile] = useState(null); // Row from profiles table

  // authLoading: only for explicit sign-in/out transitions (optional UI use)
  const [authLoading, setAuthLoading] = useState(true);

  // authReady: once true, we never block route transitions with "checking login"
  const [authReady, setAuthReady] = useState(false);

  const [profileLoading, setProfileLoading] = useState(false);

  // Refs to avoid stale closures in onAuthStateChange
  const userIdRef = useRef(null);
  const hasProfileRef = useRef(false);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user]);

  useEffect(() => {
    hasProfileRef.current = !!profile;
  }, [profile]);

  async function fetchProfile(currentUser) {
    try {
      // Use maybeSingle so "no row" doesn't throw like single() can
      const { data, error } = await withTimeout(
        supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),
        8000,
        "profiles fetch"
      );

      if (error) {
        console.warn("Profile load error:", error.message);
        return buildFallbackProfile(currentUser);
      }

      if (!data) {
        console.warn("No profile row found — using fallback profile");
        return buildFallbackProfile(currentUser);
      }

      // Normalise role value
      return { ...data, role: normalizeRole(data.role) };
    } catch (e) {
      console.warn("Profile fetch exception:", e?.message || e);
      return buildFallbackProfile(currentUser);
    }
  }

  useEffect(() => {
    let isMounted = true;

    const bootstrapAuth = async () => {
      setAuthLoading(true);

      try {
        // 1) Fast/local: get current session (no network required)
        const { data: sessionData, error: sessionError } = await withTimeout(
          supabase.auth.getSession(),
          8000,
          "auth getSession"
        );

        if (!isMounted) return;

        if (sessionError) {
          console.warn("Session error:", sessionError.message);
          setUser(null);
          setProfile(null);
          return;
        }

const sessionUser = sessionData?.session?.user ?? null;
setUser(sessionUser);

// ✅ session state is now known — routes should not redirect because we're "still checking"
setAuthReady(true);

if (!sessionUser) {
  setProfile(null);
  return;
}

// 2) Fetch profile (network) — do NOT block authReady on this
setProfileLoading(true);
const p = await fetchProfile(sessionUser);
if (!isMounted) return;
setProfile(p);
setProfileLoading(false);

      } catch (e) {
        console.warn("Auth bootstrap exception:", e?.message || e);
        if (!isMounted) return;
        setUser(null);
        setProfile(null);
      } finally {
        if (isMounted) {
          setAuthLoading(false);
          setProfileLoading(false);
          setAuthReady(true);
        }
      }
    };

    bootstrapAuth();

    // 3) Watch for login/logout events
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;

      const newUser = session?.user ?? null;
      const newUserId = newUser?.id ?? null;
      const currentUserId = userIdRef.current;

      // ✅ Token refresh happens in the background — never show "Checking login"
   if (event === "TOKEN_REFRESHED") {
  setUser(newUser);
  if (isMounted) {
    setProfileLoading(false); // ✅ add this
    setAuthReady(true);
  }
  return;
}


      const userChanged = newUserId !== currentUserId;

      // Only show loading overlay for real auth transitions
      const shouldShowLoading = event === "SIGNED_IN" || event === "SIGNED_OUT";
      if (shouldShowLoading) setAuthLoading(true);

      try {
        setUser(newUser);

        if (!newUser) {
          setProfile(null);
          return;
        }

        // Only refetch profile if user changed OR we don't have one yet
       if (userChanged || !hasProfileRef.current) {
  setProfileLoading(true);
  const p = await fetchProfile(newUser);
  if (!isMounted) return;
  setProfile(p);
  setProfileLoading(false);
        }
      } catch (e) {
        console.warn("Auth change handler exception:", e?.message || e);
        if (!isMounted) return;
        // Keep user, but fall back profile so app isn't blocked
        if (newUser) setProfile(buildFallbackProfile(newUser));
      } finally {
        if (isMounted) {
          setAuthLoading(false);
          setProfileLoading(false); 
          setAuthReady(true);
        }
      }
    });

    return () => {
      isMounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

   const value = useMemo(() => {
    const role = normalizeRole(profile?.role);

    // ✅ canonical display name for the whole app
    const displayName =
      profile?.display_name ||
      profile?.full_name ||
      user?.email ||
      "";

return {
  user,
  profile,
  role,
  displayName,
  permissionLabel: role === "admin" ? "Admin" : "Basic",
  authLoading,
  authReady,
  profileLoading,            // ✅ add this
  isAdmin: role === "admin",
};

  }, [user, profile, authLoading, authReady, profileLoading]);


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
