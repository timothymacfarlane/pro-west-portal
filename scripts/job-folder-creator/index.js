import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const FOLDER_TEMPLATE = [
  "CALC",
  "DOCS",
  path.join("DOCS", "EMAILS"),
  path.join("DOCS", "LANDGATE"),
  path.join("DOCS", "RECEIVED"),
  path.join("DOCS", "RECEIVED", "Local Government"),
  path.join("DOCS", "RECEIVED", "WAPC"),
  path.join("DOCS", "RECEIVED", "WC"),
  path.join("DOCS", "RECEIVED", "WP"),
  path.join("DOCS", "SARAH"),
  "DWG",
  "MAGNET",
  "PHOTOS",
];

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  JOB_ROOT_PATH,
  CHECK_INTERVAL_SECONDS = "60",
} = process.env;

const checkIntervalSeconds = Number(CHECK_INTERVAL_SECONDS);

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required.");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
}

if (!JOB_ROOT_PATH) {
  throw new Error("JOB_ROOT_PATH is required.");
}

if (!Number.isFinite(checkIntervalSeconds) || checkIntervalSeconds < 1) {
  throw new Error("CHECK_INTERVAL_SECONDS must be a positive number.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

let isRunning = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJobFolderPath(jobNumber) {
  const folderName = String(jobNumber || "").trim();

  if (!folderName) {
    throw new Error("Job number is empty.");
  }

  if (/[<>:"/\\|?*\x00-\x1F]/.test(folderName) || /[. ]$/.test(folderName)) {
    throw new Error(`Job number cannot be used as a Windows folder name: ${folderName}`);
  }

  return path.join(JOB_ROOT_PATH, folderName);
}

async function createJobFolder(jobFolderPath) {
  await mkdir(jobFolderPath, { recursive: true });

  for (const relativeFolder of FOLDER_TEMPLATE) {
    await mkdir(path.join(jobFolderPath, relativeFolder), { recursive: true });
  }
}

async function markJobCreated(job, jobFolderPath) {
  const { error } = await supabase
    .from("jobs")
    .update({
      folder_created: true,
      folder_created_at: new Date().toISOString(),
      folder_path: jobFolderPath,
      folder_error: null,
    })
    .eq("id", job.id);

  if (error) {
    throw error;
  }
}

async function markJobError(job, errorMessage) {
  const { error } = await supabase
    .from("jobs")
    .update({
      folder_error: errorMessage.slice(0, 2000),
    })
    .eq("id", job.id);

  if (error) {
    console.error(`Failed to record folder error for job ${job.job_number}:`, error.message);
  }
}

async function processJob(job) {
  try {
    const jobFolderPath = getJobFolderPath(job.job_number);
    await createJobFolder(jobFolderPath);
    await markJobCreated(job, jobFolderPath);
    console.log(`Created folder for job ${job.job_number}: ${jobFolderPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markJobError(job, message);
    console.error(`Folder creation failed for job ${job.job_number}:`, message);
  }
}

async function runOnce() {
  if (isRunning) {
    console.log("Previous run still in progress; skipping this interval.");
    return;
  }

  isRunning = true;

  try {
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, job_number")
      .eq("folder_created", false)
      .order("job_number", { ascending: true })
      .limit(50);

    if (error) {
      throw error;
    }

    if (!jobs?.length) {
      console.log("No pending job folders.");
      return;
    }

    for (const job of jobs) {
      await processJob(job);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Job folder creator run failed:", message);
  } finally {
    isRunning = false;
  }
}

async function main() {
  console.log(`Job folder creator started. Checking every ${checkIntervalSeconds} seconds.`);
  console.log(`Job root path: ${JOB_ROOT_PATH}`);

  while (true) {
    await runOnce();
    await sleep(checkIntervalSeconds * 1000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
