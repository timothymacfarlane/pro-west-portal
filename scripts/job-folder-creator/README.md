# Job Folder Creator

Small office-PC worker that polls Supabase for new jobs and creates Windows job folders on the network share.

This script is create-only:

- New portal jobs create Windows folders.
- Deleting portal jobs does not delete Windows folders.
- Deleting Windows folders does not affect the portal.
- Editing a job does not rename a folder.

## Setup

Install dependencies:

```powershell
cd C:\Dev\pro-west-portal\scripts\job-folder-creator
npm install
```

Create a local `.env` file from `.env.example`:

```powershell
copy .env.example .env
```

Set:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JOB_ROOT_PATH=\\PER-SERVER-001\J_Data
CHECK_INTERVAL_SECONDS=60
```

Keep `.env` on the office PC only. Do not put the service-role key in the React app or commit it to git.

## Run Manually

```powershell
cd C:\Dev\pro-west-portal\scripts\job-folder-creator
npm start
```

The script runs continuously and checks every 60 seconds by default.

## Windows Task Scheduler

Set this up later as a background task on the office PC that can access the network share.

Suggested action:

- Program/script: `node`
- Add arguments: `index.js`
- Start in: `C:\Dev\pro-west-portal\scripts\job-folder-creator`

Use a Windows account that has access to `\\PER-SERVER-001\J_Data`.

## Folder Template

For each pending job, the script creates:

```text
<JOB_ROOT_PATH>\<job_number>
<JOB_ROOT_PATH>\<job_number>\CALC
<JOB_ROOT_PATH>\<job_number>\DOCS
<JOB_ROOT_PATH>\<job_number>\DOCS\EMAILS
<JOB_ROOT_PATH>\<job_number>\DOCS\LANDGATE
<JOB_ROOT_PATH>\<job_number>\DOCS\RECEIVED
<JOB_ROOT_PATH>\<job_number>\DOCS\RECEIVED\Local Government
<JOB_ROOT_PATH>\<job_number>\DOCS\RECEIVED\WAPC
<JOB_ROOT_PATH>\<job_number>\DOCS\RECEIVED\WC
<JOB_ROOT_PATH>\<job_number>\DOCS\RECEIVED\WP
<JOB_ROOT_PATH>\<job_number>\SARAH
<JOB_ROOT_PATH>\<job_number>\DWG
<JOB_ROOT_PATH>\<job_number>\MAGNET
<JOB_ROOT_PATH>\<job_number>\PHOTOS
```

If the folder already exists, that is treated as success.
