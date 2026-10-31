# Restoring planning-schedule link exports

The daily backup writes table data as CSV and JSON to the `table-backups` Storage bucket. There is no automated restore script in this repository.

For a backup folder containing `schedule_job_ref_links`, restore its parent rows in `schedule_assignments` and `job_planning_entries` first, then restore `schedule_job_ref_links` with its original IDs and foreign keys. A full restore must also satisfy the parent tables' own dependencies before importing those rows.

Backup folders created before this table was added do not contain `schedule_job_ref_links.csv` or `schedule_job_ref_links.json`. A missing file in an older folder does not mean the table was empty. Check row counts and foreign-key integrity after restoring into an isolated environment.
