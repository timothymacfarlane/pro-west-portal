# Pro West Job File Gateway

Read-only browser access to a saved job's server folder. The portal sends the user's Supabase access token to this gateway; the gateway verifies the active profile and job, then issues a one-use launch link. The link creates a short-lived, HTTP-only browser session. Staff can browse one job folder at a time and view or download files. The gateway never lists the J_Data root and has no upload, rename, or delete endpoint.

The Windows File Explorer helper remains separate. This gateway is for phones and tablets.

## Requirements

- Node.js 22 or later on an always-on Windows host that can reach the job share.
- A Windows runtime identity that can read the job folders. Verify its **effective** NTFS rights before permanent rollout; a read grant alone does not restrict an account if another ACL entry already gives it write access.
- The host joined to the existing private network. Use Tailscale Serve to provide a private HTTPS address. Do not use Funnel or publish the gateway to the public internet.
- The portal's Supabase project URL and its public publishable/anon key. A service-role key is neither needed nor accepted.

When hosting on PER-SERVER-001 itself, set `JOB_ROOT_PATH` to the local folder path returned by `Get-SmbShare -Name J_Data | Select-Object Name,Path`. A local path avoids a network round trip back to the same server. If hosting on another computer later, use `\\PER-SERVER-001\J_Data`. Do not use a mapped `J:` drive: Windows services run in a separate logon session and cannot rely on the user's drive mappings.

## Local configuration

Copy config.example.env to .env in this folder and fill in the real values. .env is ignored by Git. GATEWAY_PUBLIC_URL must be the HTTPS origin provided by Tailscale Serve, with no path. PORTAL_ORIGINS must contain the exact portal origin; include a local development origin only while testing.

Run npm test, then start the gateway on the chosen host with npm start. It listens only on 127.0.0.1:8787 by default. Check http://127.0.0.1:8787/health locally; HTTP 200 confirms the gateway can reach the configured job root. Keep this PowerShell window open for the pilot.

On that host, configure Tailscale Serve to proxy its private HTTPS address to port 8787. Review the current tailscale serve --help output on the host before running the command; for current versions the basic form is tailscale serve --bg 8787. Confirm the HTTPS /health endpoint is reachable from a connected mobile device and not from an unconnected device.

Set VITE_JOB_FILES_GATEWAY_URL for the portal to that HTTPS origin and rebuild the portal. Until this value is set, the mobile job-folder button stays hidden. Existing Windows behaviour is unaffected.

## Unattended startup after the pilot

In an Administrator PowerShell window on the gateway host, run `register-startup-task.ps1` from the installed gateway folder. It registers a task named `ProWestJobFileGateway` under Windows Local Service, with a startup trigger and restart attempts. It does not start a second copy of the gateway or change job-folder permissions. Stop the interactive `npm start` process with Ctrl+C, then run `Start-ScheduledTask -TaskName ProWestJobFileGateway`. Confirm `Get-ScheduledTask -TaskName ProWestJobFileGateway` shows Running, the local and private HTTPS `/health` endpoints return HTTP 200, and an authenticated portal user can still open a job. The task will run after logoff and start again after reboot. Do not reboot the production server solely for this test; check the startup behaviour at the next planned reboot.

To remove the startup task, run `remove-startup-task.ps1` in an Administrator PowerShell window. The gateway files and job folders remain in place. Tailscale Serve is configured separately and can be disabled with the command shown by `tailscale serve status`/Serve setup.

The gateway has only read endpoints, but its Windows process inherits the server's NTFS rights. In particular, an existing `Everyone: Full Control` entry means Local Service has write rights on disk even though the browser cannot request a write. Review that existing ACL with the server administrator before treating the gateway process as filesystem read-only; the startup scripts deliberately leave shared-folder ACLs unchanged.

The first browser request from a public portal to a private host may trigger a one-time local network access prompt in some Chrome versions. Test and allow that prompt on the pilot device. The gateway accepts cross-origin launch requests only from the configured portal origins and requires a valid Supabase access token.

## Pilot checklist

1. From a phone or tablet, open saved job 9170 and tap Open Job Folder. Confirm its contents appear without loading the J_Data root.
2. Open a nested folder, preview a PDF or image, and download another file.
3. Try an admin and a basic account. Disable a test account and confirm access ends within one minute.
4. Test a missing job folder, an expired session, and a disconnected device. Error messages refer to the company network, not any specific network product.
5. Restart the gateway; users should be able to reopen the job from the portal. Existing file sessions expire on restart.

This first version uses a 15-minute file session per job and rechecks portal permissions at least once per minute. The gateway holds session tokens only in memory and does not write job files. The gateway's Windows account determines the maximum files it can read; if staff later need different file permissions per person, add that rule to the gateway before widening access.
