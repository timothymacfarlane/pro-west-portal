export function isActiveProfile(profile) {
  return profile?.is_active === true;
}

export function isContactsVisibleProfile(profile) {
  return isActiveProfile(profile) && profile?.show_in_contacts === true;
}

export function isCurrentEmployeeProfile(profile) {
  return isActiveProfile(profile);
}

export function profileDisplayName(profile, fallback = "Unnamed") {
  return (profile?.display_name || profile?.email || fallback || "").trim();
}

export function profileEmployeeOption(profile) {
  return {
    id: profile.id,
    name: profileDisplayName(profile, ""),
    email: profile.email || "",
  };
}
