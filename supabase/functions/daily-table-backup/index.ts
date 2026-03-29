import { createClient } from "supabase";

const BUCKET = "table-backups";
const TABLES = [
  "clients",
  "jobs",
  "timesheet_entries",
  "schedule_assignments",
  "job_planning_entries",
  "job_planning_unscheduled",
  "profiles",
  "documents",
  "map_notes",
  "schedule_people",
  "document_favourites",
  "document_versions",
  "job_reassign_log",
  "jobs_legacy_raw",
  "notifications",
  "take5_submissions",
  "timesheet_locks",
  "vehicle_prestart_submissions",
] as const;

const KEEP_DAYS = 28;
const PAGE_SIZE = 1000;

type TableName = (typeof TABLES)[number];
type JsonRow = Record<string, unknown>;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";

  const str =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsv(rows: JsonRow[]): string {
  if (rows.length === 0) return "";

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvEscape(row[header])).join(",")
    ),
  ];

  return lines.join("\n");
}

function getPerthFolderName(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${map.year}-${map.month}-${map.day}_${map.hour}${map.minute}`;
}

async function fetchAllRows(
  supabaseAdmin: any,
  table: TableName,
): Promise<JsonRow[]> {
  const allRows: JsonRow[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;

    console.log(`Reading table: ${table}, rows ${from} to ${to}`);

    const { data, error } = await supabaseAdmin
      .from(table)
      .select("*")
      .range(from, to);

    if (error) {
      throw new Error(
        `Failed reading ${table}: ${error.message} | details: ${error.details ?? "none"} | hint: ${error.hint ?? "none"}`,
      );
    }

    if (!data || data.length === 0) break;

    allRows.push(...(data as JsonRow[]));

    if (data.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return allRows;
}

async function uploadTableFiles(
  supabaseAdmin: any,
  folder: string,
  table: TableName,
  rows: JsonRow[],
) {
  const csv = toCsv(rows);
  const json = JSON.stringify(rows, null, 2);

  const csvPath = `${folder}/${table}.csv`;
  const jsonPath = `${folder}/${table}.json`;

  console.log(`Uploading CSV for ${table} to ${csvPath}`);
  const { error: csvError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(csvPath, new Blob([csv], { type: "text/csv;charset=utf-8" }), {
      contentType: "text/csv",
      upsert: false,
    });

  if (csvError) {
    throw new Error(`Failed uploading ${csvPath}: ${csvError.message}`);
  }

  console.log(`Uploading JSON for ${table} to ${jsonPath}`);
  const { error: jsonError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(
      jsonPath,
      new Blob([json], { type: "application/json;charset=utf-8" }),
      {
        contentType: "application/json",
        upsert: false,
      },
    );

  if (jsonError) {
    throw new Error(`Failed uploading ${jsonPath}: ${jsonError.message}`);
  }

  return { csvPath, jsonPath };
}

async function pruneOldBackups(supabaseAdmin: any) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list("", {
      limit: 500,
      offset: 0,
      sortBy: { column: "name", order: "asc" },
    });

  if (error) {
    throw new Error(`Failed listing backup folders: ${error.message}`);
  }

  const backupFolders = (data ?? [])
    .map((item: any) => item.name)
    .filter((name: string) => /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(name))
    .sort();

  const foldersToDelete = backupFolders.slice(
    0,
    Math.max(0, backupFolders.length - KEEP_DAYS),
  );

  for (const folder of foldersToDelete) {
    const paths = TABLES.flatMap((table) => [
      `${folder}/${table}.csv`,
      `${folder}/${table}.json`,
    ]);

    console.log(`Pruning old backup folder: ${folder}`);

    const { error: removeError } = await supabaseAdmin.storage
      .from(BUCKET)
      .remove(paths);

    if (removeError) {
      throw new Error(
        `Failed pruning folder ${folder}: ${removeError.message}`,
      );
    }
  }

  return foldersToDelete;
}

Deno.serve(async () => {
  try {
    console.log("Daily backup function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const folder = getPerthFolderName();

    console.log(`Backup folder: ${folder}`);

    const summary: Record<string, { rows: number; files: string[] }> = {};

    for (const table of TABLES) {
      console.log(`Starting backup for table: ${table}`);

      const rows = await fetchAllRows(supabaseAdmin, table);

      console.log(`Fetched ${rows.length} rows from ${table}`);

      const uploaded = await uploadTableFiles(
        supabaseAdmin,
        folder,
        table,
        rows,
      );

      console.log(`Uploaded backup files for ${table}`);

      summary[table] = {
        rows: rows.length,
        files: [uploaded.csvPath, uploaded.jsonPath],
      };
    }

    const prunedFolders = await pruneOldBackups(supabaseAdmin);

    console.log("Daily backup function completed successfully");

    return new Response(
      JSON.stringify(
        {
          ok: true,
          bucket: BUCKET,
          folder,
          tables: summary,
          prunedFolders,
        },
        null,
        2,
      ),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Daily backup function failed:", error);

    return new Response(
      JSON.stringify(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});