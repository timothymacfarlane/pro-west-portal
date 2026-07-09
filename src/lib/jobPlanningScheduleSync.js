export function splitScheduleJobRefs(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function joinScheduleJobRefs(refs) {
  return [...new Set((refs || []).map((ref) => String(ref || "").trim()).filter(Boolean))].join(", ");
}

export function planningJobRef(entry) {
  const ref = String(entry?.job_number || "").trim();
  if (!ref || ref.toLowerCase() === "notes") return "";
  return ref;
}

export const DEFAULT_JOB_PLANNING_SCHEDULE_STATUS = "FIELD";

function hasNonDefaultScheduleStatus(assignment) {
  const status = String(assignment?.status || "").trim();
  return status && status.toUpperCase() !== DEFAULT_JOB_PLANNING_SCHEDULE_STATUS;
}

export function resolveSchedulePersonId(assignedTo, people) {
  const value = String(assignedTo || "").trim();
  if (!value) return "";

  const byId = (people || []).find((person) => person.id === value);
  if (byId) return byId.id;

  const lower = value.toLowerCase();
  const byName = (people || []).find((person) => String(person.name || "").trim().toLowerCase() === lower);
  return byName?.id || "";
}

async function getScheduleAssignment(supabase, dateISO, personId) {
  const { data, error } = await supabase
    .from("schedule_assignments")
    .select("*")
    .eq("date", dateISO)
    .eq("person_id", personId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function createScheduleAssignment(supabase, dateISO, personId, jobRef) {
  const { data, error } = await supabase
    .from("schedule_assignments")
    .insert({
      date: dateISO,
      person_id: personId,
      status: DEFAULT_JOB_PLANNING_SCHEDULE_STATUS,
      region: "",
      job_ref: jobRef,
      notes: "",
      touched: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateAssignmentJobRefs(supabase, assignment, refs) {
  const nextJobRef = joinScheduleJobRefs(refs);

  if (!nextJobRef && !hasNonDefaultScheduleStatus(assignment)) {
    const { error } = await supabase
      .from("schedule_assignments")
      .delete()
      .eq("id", assignment.id);
    if (error) throw error;
    return null;
  }

  const { data, error } = await supabase
    .from("schedule_assignments")
    .update({
      job_ref: nextJobRef,
      region: nextJobRef ? assignment?.region || "" : "",
      notes: nextJobRef ? assignment?.notes || "" : "",
      touched: !!nextJobRef,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignment.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function cleanupEmptyScheduleAssignment(supabase, assignment) {
  if (!assignment?.id) return null;
  if (splitScheduleJobRefs(assignment.job_ref).length > 0) return assignment;

  if (!hasNonDefaultScheduleStatus(assignment)) {
    const { error } = await supabase
      .from("schedule_assignments")
      .delete()
      .eq("id", assignment.id);

    if (error) throw error;
    return null;
  }

  const { data, error } = await supabase
    .from("schedule_assignments")
    .update({
      job_ref: "",
      region: "",
      notes: "",
      touched: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignment.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function unlinkPlanningEntryFromSchedule(supabase, jobPlanningEntryId) {
  if (jobPlanningEntryId == null) return;

  const { data: link, error: linkError } = await supabase
    .from("schedule_job_ref_links")
    .select("*")
    .eq("job_planning_entry_id", jobPlanningEntryId)
    .limit(1)
    .maybeSingle();

  if (linkError) throw linkError;
  if (!link) return;

  const { data: assignment, error: assignmentError } = await supabase
    .from("schedule_assignments")
    .select("*")
    .eq("id", link.schedule_assignment_id)
    .limit(1)
    .maybeSingle();

  if (assignmentError) throw assignmentError;

  const { data: siblingLinks, error: siblingError } = await supabase
    .from("schedule_job_ref_links")
    .select("*")
    .eq("schedule_assignment_id", link.schedule_assignment_id)
    .eq("job_ref", link.job_ref);

  if (siblingError) throw siblingError;

  const { error: deleteLinkError } = await supabase
    .from("schedule_job_ref_links")
    .delete()
    .eq("id", link.id);

  if (deleteLinkError) throw deleteLinkError;

  if (!assignment) return;

  const keepRef = (siblingLinks || []).some((sibling) => sibling.id !== link.id);
  if (keepRef) return;

  const nextRefs = splitScheduleJobRefs(assignment.job_ref).filter((ref) => ref !== link.job_ref);
  await updateAssignmentJobRefs(supabase, assignment, nextRefs);
}

export async function syncPlanningEntryToSchedule(supabase, entry, people) {
  const jobRef = planningJobRef(entry);
  const personId = resolveSchedulePersonId(entry?.assigned_to, people);
  const dateISO = String(entry?.date || "").trim();

  if (!entry?.id || !dateISO || !personId || !jobRef) {
    if (entry?.id != null) await unlinkPlanningEntryFromSchedule(supabase, entry.id);
    return null;
  }

  const { data: existingLink, error: existingLinkError } = await supabase
    .from("schedule_job_ref_links")
    .select("*")
    .eq("job_planning_entry_id", entry.id)
    .limit(1)
    .maybeSingle();

  if (existingLinkError) throw existingLinkError;

  let assignment = await getScheduleAssignment(supabase, dateISO, personId);
  if (!assignment) {
    assignment = await createScheduleAssignment(supabase, dateISO, personId, jobRef);
  }

  if (existingLink && existingLink.schedule_assignment_id !== assignment.id) {
    await unlinkPlanningEntryFromSchedule(supabase, entry.id);
  }

  const refs = splitScheduleJobRefs(assignment.job_ref);
  const withoutOldRef = existingLink?.job_ref
    ? refs.filter((ref) => ref !== existingLink.job_ref || ref === jobRef)
    : refs;
  const nextRefs = withoutOldRef.includes(jobRef) ? withoutOldRef : [...withoutOldRef, jobRef];
  assignment = await updateAssignmentJobRefs(supabase, assignment, nextRefs);

  const linkPayload = {
    schedule_assignment_id: assignment.id,
    job_planning_entry_id: entry.id,
    job_ref: jobRef,
    updated_at: new Date().toISOString(),
  };

  const { data: currentLink, error: currentLinkError } = await supabase
    .from("schedule_job_ref_links")
    .select("*")
    .eq("job_planning_entry_id", entry.id)
    .limit(1)
    .maybeSingle();

  if (currentLinkError) throw currentLinkError;

  if (currentLink) {
    const { error } = await supabase
      .from("schedule_job_ref_links")
      .update(linkPayload)
      .eq("id", currentLink.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("schedule_job_ref_links").insert(linkPayload);
    if (error) throw error;
  }

  return assignment;
}

export async function materializePlanningEntriesForSchedule(supabase, entries, people, existingAssignments = []) {
  const assignmentByKey = new Map(
    (existingAssignments || [])
      .filter((assignment) => assignment?.date && assignment?.person_id)
      .map((assignment) => [`${assignment.date}|${assignment.person_id}`, assignment])
  );

  const eligibleEntries = (entries || [])
    .map((entry) => {
      const jobRef = planningJobRef(entry);
      const personId = resolveSchedulePersonId(entry?.assigned_to, people);
      const dateISO = String(entry?.date || "").trim();

      if (!entry?.id || !dateISO || !personId || !jobRef) return null;

      return {
        entry,
        jobRef,
        personId,
        dateISO,
        assignmentKey: `${dateISO}|${personId}`,
      };
    })
    .filter(Boolean);

  const eligibleByEntryId = new Map(eligibleEntries.map((item) => [String(item.entry.id), item]));
  const existingAssignmentIds = [...assignmentByKey.values()]
    .map((assignment) => assignment.id)
    .filter((id) => id != null);

  let existingAssignmentLinks = [];
  if (existingAssignmentIds.length > 0) {
    const { data, error } = await supabase
      .from("schedule_job_ref_links")
      .select("*")
      .in("schedule_assignment_id", existingAssignmentIds);

    if (error) throw error;
    existingAssignmentLinks = data || [];
  }

  const staleLinks = [];
  const keptLinks = [];

  for (const link of existingAssignmentLinks) {
    const eligible = eligibleByEntryId.get(String(link.job_planning_entry_id));
    const assignment = eligible ? assignmentByKey.get(eligible.assignmentKey) : null;
    const isCurrent =
      eligible &&
      assignment?.id &&
      String(link.schedule_assignment_id) === String(assignment.id) &&
      String(link.job_ref || "") === eligible.jobRef;

    if (isCurrent) {
      keptLinks.push(link);
    } else {
      staleLinks.push(link);
    }
  }

  if (staleLinks.length > 0) {
    const { error } = await supabase
      .from("schedule_job_ref_links")
      .delete()
      .in(
        "id",
        staleLinks.map((link) => link.id)
      );

    if (error) throw error;
  }

  const keptRefsByAssignmentId = new Map();
  for (const link of keptLinks) {
    const assignmentId = String(link.schedule_assignment_id);
    if (!keptRefsByAssignmentId.has(assignmentId)) keptRefsByAssignmentId.set(assignmentId, new Set());
    keptRefsByAssignmentId.get(assignmentId).add(String(link.job_ref || "").trim());
  }

  const refsByAssignmentId = new Map();
  const changedAssignmentIds = new Set();

  for (const link of staleLinks) {
    const assignmentId = String(link.schedule_assignment_id);
    const assignment = [...assignmentByKey.values()].find((row) => String(row.id) === assignmentId);
    if (!assignment) continue;

    if (!refsByAssignmentId.has(assignmentId)) {
      refsByAssignmentId.set(assignmentId, splitScheduleJobRefs(assignment.job_ref));
    }

    const staleRef = String(link.job_ref || "").trim();
    const keptRefs = keptRefsByAssignmentId.get(assignmentId);
    if (staleRef && !keptRefs?.has(staleRef)) {
      const nextRefs = refsByAssignmentId.get(assignmentId).filter((ref) => ref !== staleRef);
      refsByAssignmentId.set(assignmentId, nextRefs);
      changedAssignmentIds.add(assignmentId);
    }
  }

  if (eligibleEntries.length === 0 && staleLinks.length === 0) return existingAssignments || [];

  const missingAssignmentPayloads = [];
  const missingAssignmentKeys = new Set();

  for (const item of eligibleEntries) {
    if (assignmentByKey.has(item.assignmentKey) || missingAssignmentKeys.has(item.assignmentKey)) continue;

    missingAssignmentKeys.add(item.assignmentKey);
    missingAssignmentPayloads.push({
      date: item.dateISO,
      person_id: item.personId,
      status: DEFAULT_JOB_PLANNING_SCHEDULE_STATUS,
      region: "",
      job_ref: "",
      notes: "",
      touched: true,
    });
  }

  if (missingAssignmentPayloads.length > 0) {
    const { data: insertedAssignments, error } = await supabase
      .from("schedule_assignments")
      .insert(missingAssignmentPayloads)
      .select();

    if (error) throw error;

    for (const assignment of insertedAssignments || []) {
      assignmentByKey.set(`${assignment.date}|${assignment.person_id}`, assignment);
    }
  }

  const linksByEntryId = new Map();
  const entryIds = eligibleEntries.map((item) => item.entry.id);
  let existingLinks = [];

  if (entryIds.length > 0) {
    const { data, error: linksError } = await supabase
      .from("schedule_job_ref_links")
      .select("*")
      .in("job_planning_entry_id", entryIds);

    if (linksError) throw linksError;
    existingLinks = data || [];
  }

  for (const link of existingLinks) {
    linksByEntryId.set(String(link.job_planning_entry_id), link);
  }

  const linkPayloads = [];

  for (const item of eligibleEntries) {
    const assignment = assignmentByKey.get(item.assignmentKey);
    if (!assignment?.id) continue;

    const assignmentId = String(assignment.id);
    if (!refsByAssignmentId.has(assignmentId)) {
      refsByAssignmentId.set(assignmentId, splitScheduleJobRefs(assignment.job_ref));
    }

    const refs = refsByAssignmentId.get(assignmentId);
    if (!refs.includes(item.jobRef)) {
      refs.push(item.jobRef);
      changedAssignmentIds.add(assignmentId);
    }

    const existingLink = linksByEntryId.get(String(item.entry.id));
    if (
      !existingLink ||
      String(existingLink.schedule_assignment_id) !== assignmentId ||
      String(existingLink.job_ref || "") !== item.jobRef
    ) {
      linkPayloads.push({
        schedule_assignment_id: assignment.id,
        job_planning_entry_id: item.entry.id,
        job_ref: item.jobRef,
        updated_at: new Date().toISOString(),
      });
    }
  }

  const assignmentUpdates = [...assignmentByKey.values()]
    .filter((assignment) => changedAssignmentIds.has(String(assignment.id)))
    .map(async (assignment) => {
      const assignmentId = String(assignment.id);
      const nextJobRef = joinScheduleJobRefs(refsByAssignmentId.get(assignmentId));

      if (!nextJobRef && !hasNonDefaultScheduleStatus(assignment)) {
        const { error } = await supabase
          .from("schedule_assignments")
          .delete()
          .eq("id", assignment.id);

        if (error) throw error;
        return {
          deleted: true,
          assignmentKey: `${assignment.date}|${assignment.person_id}`,
        };
      }

      const { data, error } = await supabase
        .from("schedule_assignments")
        .update({
          job_ref: nextJobRef,
          region: nextJobRef ? assignment?.region || "" : "",
          notes: nextJobRef ? assignment?.notes || "" : "",
          touched: !!nextJobRef,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assignment.id)
        .select()
        .single();

      if (error) throw error;
      return {
        deleted: false,
        assignment: data,
      };
    });

  for (const result of await Promise.all(assignmentUpdates)) {
    if (result?.deleted) {
      assignmentByKey.delete(result.assignmentKey);
    } else if (result?.assignment) {
      assignmentByKey.set(`${result.assignment.date}|${result.assignment.person_id}`, result.assignment);
    }
  }

  if (linkPayloads.length > 0) {
    const { error } = await supabase
      .from("schedule_job_ref_links")
      .upsert(linkPayloads, { onConflict: "job_planning_entry_id" });

    if (error) throw error;
  }

  return [...assignmentByKey.values()];
}
