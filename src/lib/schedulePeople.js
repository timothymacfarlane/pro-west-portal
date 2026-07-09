export async function loadSchedulePeople(supabase) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email, is_active, show_in_schedule")
    .eq("is_active", true)
    .eq("show_in_schedule", true)
    .order("display_name", { ascending: true });

  if (error) throw error;

  const normalized = (data || [])
    .map((p) => ({
      id: p.id,
      name: p.display_name || p.email || "Unnamed",
    }))
    .filter((p) => p.id);

  const specialName = "Pro West Survey";
  const normal = normalized.filter((p) => p.name !== specialName);
  const special = normalized.filter((p) => p.name === specialName);

  return [...normal, ...special];
}
