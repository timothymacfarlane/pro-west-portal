import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // Supabase auth user
  const [profile, setProfile] = useState(null); // Row from profiles table
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadUserAndProfile = async () => {
      setAuthLoading(true);

      // 1. Load current auth user
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (userError) {
        console.warn("Auth error:", userError.message);
        setUser(null);
        setProfile(null);
        setAuthLoading(false);
        return;
      }

      const currentUser = userData?.user ?? null;
      setUser(currentUser);

      if (!currentUser) {
        setProfile(null);
        setAuthLoading(false);
        return;
      }

      // 2. Load matching profile row
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();

      if (profileError) {
        console.warn("Profile load error:", profileError.message);

        // Fallback if no profile exists
        setProfile({
          id: currentUser.id,
          email: currentUser.email,
          display_name: currentUser.email,
          role: "BASIC",
          is_active: true,
          show_in_contacts: true,
          show_in_schedule: true,
          show_in_timesheets: true
        });
      } else {
        setProfile(profileData);
      }

      setAuthLoading(false);
    };

    loadUserAndProfile();

    // 3. Watch for login/logout events
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);

      if (newUser) {
        supabase
          .from("profiles")
          .select("*")
          .eq("id", newUser.id)
          .single()
          .then(({ data }) => {
            setProfile(data);
          });
      } else {
        setProfile(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    user,
    profile,
    role: profile?.role || "BASIC",
    authLoading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
