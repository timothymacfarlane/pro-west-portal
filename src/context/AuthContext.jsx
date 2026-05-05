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
    const { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .select("id, role, display_name, mobile, job_title, is_active")
        .eq("id", currentUser.id)
        .maybeSingle(),
      2000,
      "profiles fetch"
    );

    if (error) throw error;
    if (!data) return null;

    const profile = { ...data, role: normalizeRole(data.role) };

    if (!profile.is_active) {
      console.warn("User is inactive — signing out");
      await supabase.auth.signOut();
      return null;
    }

    return profile;
  } catch (e) {
    console.warn("Profile fetch exception:", e?.message || e);
    return null;
  }
}


async function updateLastLogin(userId) {
  if (!userId) return;

  const { error } = await supabase
    .from("profiles")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    console.warn("Could not update last login:", error.message);
  }
}

  useEffect(() => {
    let isMounted = true;

    const bootstrapAuth = async () => {
      setAuthLoading(true);

      try {
        // 1) Fast/local: get current session (no network required)
        const { data: sessionData, error: sessionError } =
  await supabase.auth.getSession();

        if (!isMounted) return;

        if (sessionError) {
  console.warn("Session error:", sessionError.message);

  // Do not force logout on a session read error.
  // Let the user stay on the loading screen rather than being sent to login.
  return;
}

const sessionUser = sessionData?.session?.user ?? null;
setUser(sessionUser);

// ✅ session state is now known — routes should not redirect because we're "still checking"
setAuthReady(true);
setAuthLoading(false);

if (!sessionUser) {
  setProfile(null);
  return;
}

// 2) Fetch profile (network) — do NOT block the portal opening
setProfileLoading(true);
const p = await fetchProfile(sessionUser);
if (!isMounted) return;

if (!p) {
  console.warn("Profile failed to load — retrying in background");
  setProfileLoading(false);

 setTimeout(async () => {
  if (!isMounted) return;

  const retryProfile = await fetchProfile(sessionUser);

  if (!isMounted) return;

  if (retryProfile) {
    setProfile(retryProfile);
  }
}, 3000);

  return;
}

setProfile(p);

updateLastLogin(sessionUser.id).catch((e) =>
  console.warn("Last login update failed:", e?.message || e)
);
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

  // 🔥 Ensure profile exists after token refresh
  if (!hasProfileRef.current && newUser) {
    try {
      setProfileLoading(true);
      const p = await fetchProfile(newUser);
      if (p) {
        setProfile(p);
      }
    } catch (e) {
      console.warn("Profile fetch on token refresh failed:", e?.message || e);
    } finally {
      setProfileLoading(false);
    }
  }

  if (isMounted) {
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

if (!p) {
  console.warn("Profile failed to load — retrying in background");

  if (userChanged) {
    setProfile(null);
  }

  setProfileLoading(false);

  setTimeout(async () => {
  if (!isMounted) return;

  const retryProfile = await fetchProfile(newUser);

  if (!isMounted) return;

  if (retryProfile) {
    setProfile(retryProfile);
  }
}, 3000);

  return;
}

    setProfile(p);

if (event === "SIGNED_IN" && newUser?.id) {
  updateLastLogin(newUser.id).catch((e) =>
    console.warn("Last login update failed:", e?.message || e)
  );
}
    setProfileLoading(false);
  }
} catch (e) {
  console.warn("Auth change handler exception:", e?.message || e);
  if (!isMounted) return;

 if (!newUser) {
  setUser(null);
  setProfile(null);
}
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

useEffect(() => {
  if (!user?.id) return;

  const channel = supabase
    .channel(`profile-active-${user.id}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "profiles",
        filter: `id=eq.${user.id}`,
      },
      async (payload) => {
        const next = payload.new;

        // 🚨 If admin unticks Active → instant logout
        if (!next?.is_active) {
          console.warn("User deactivated — logging out");
          await supabase.auth.signOut();
        } else {
          // keep profile updated live
          setProfile((prev) => ({
  ...(prev || {}),
  ...next,
  role: normalizeRole(next.role),
}));
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [user?.id]);

const value = useMemo(() => {
  const rawRole = profile?.role;
  const role = rawRole ? normalizeRole(rawRole) : null;

  const permissionsReady = !user || !!profile;

  // ✅ canonical display name for the whole app
  const displayName =
  profile?.display_name ||
  user?.email ||
  "";

 return {
  user,
  profile,
  role,
  displayName,
  permissionLabel:
    role === "admin" ? "Admin" : role === "basic" ? "Basic" : "Loading",
  authLoading,
  authReady,
  profileLoading,
  permissionsReady,
  isAdmin: role === "admin",
};
}, [user, profile, authLoading, authReady, profileLoading]);


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
