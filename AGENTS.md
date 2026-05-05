# AGENTS.md — Pro West Portal

This file gives Codex and other AI coding agents project-specific instructions for working safely in the Pro West Portal codebase.

## Project Summary

Pro West Portal is a React + Vite web portal for Pro West Surveying. It uses Supabase for authentication, profiles, database access, and Edge Functions. It includes operational pages for jobs, maps, contacts, documents, job planning, schedule, Take 5, vehicle prestart, timesheets, shopping list, weather, notifications, and administration.

The portal is used on both desktop and mobile field devices. Changes must preserve the current Pro West style, be robust, fast, safe, and mobile-optimised.

## Technology Stack

- React 19
- Vite
- React Router
- Supabase JavaScript client
- Google Maps JavaScript API
- MarkerClusterer
- proj4 for coordinate/projection work
- jsPDF for PDF output
- Central styling in `src/App.css`
- Supabase Edge Function currently present under `supabase/functions/daily-table-backup`

Useful commands:

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

Always run `npm run build` before considering a coding task complete. Run `npm run lint` when practical, but do not make large unrelated lint rewrites unless asked.

## High-Level File Map

Core app files:

- `src/main.jsx` — React root, `BrowserRouter`, `AuthProvider`. React StrictMode is intentionally disabled for field testing to avoid double effects.
- `src/App.jsx` — top-level portal shell, header, sidebar, lazy-loaded routes, mobile sidebar behaviour, logout, navigation visibility.
- `src/App.css` — main global portal theme, layouts, mobile overrides, maps styles, schedule styles, job planning styles, print styles, field-device polish.
- `src/index.css` — base document/root styles.
- `src/lib/supabaseClient.js` — Supabase client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Auth and permissions:

- `src/context/AuthContext.jsx` — canonical source for auth state, profile state, role, `isAdmin`, active-user checks, profile timeout/retry, token refresh handling, last-login update, and live profile active-state subscription.
- `src/components/ProtectedRoute.jsx` — route guard for logged-in users and `adminOnly` routes.

Shared components:

- `src/components/PageLayout.jsx` — common page layout pattern.
- `src/components/NotificationBell.jsx` — in-app notifications.

Main pages:

- `src/pages/Home.jsx`
- `src/pages/Admin.jsx`
- `src/pages/Profile.jsx`
- `src/pages/Contacts.jsx`
- `src/pages/Documents.jsx`
- `src/pages/Jobs.jsx`
- `src/pages/MyJobs.jsx`
- `src/pages/JobPlanning.jsx`
- `src/pages/Maps.jsx`
- `src/pages/Schedule.jsx`
- `src/pages/ShoppingList.jsx`
- `src/pages/Take5.jsx`
- `src/pages/Take5Register.jsx`
- `src/pages/Timesheets.jsx`
- `src/pages/VehiclePrestart.jsx`
- `src/pages/VehiclePrestartRegister.jsx`
- `src/pages/Weather.jsx`
- `src/pages/Login.jsx`
- `src/pages/ResetPassword.jsx`

Supabase:

- `supabase/functions/daily-table-backup/index.ts`
- `supabase/functions/daily-table-backup/deno.json`
- `supabase/functions/daily-table-backup/.npmrc`
- `supabase/config.toml`

## Non-Negotiable Project Goals

Every change should support these goals:

1. Keep the current Pro West Portal style and theme consistent.
2. Preserve existing working functionality unless explicitly asked to change it.
3. Keep the portal fast and responsive.
4. Optimise for mobile and field-device use.
5. Keep auth/admin logic safe and predictable.
6. Avoid large rewrites when a small targeted edit solves the problem.
7. Make changes easy for the owner to understand and review.

## Visual Style and Theme Rules

The portal style is already established in `src/App.css`. Reuse it.

Primary colours:

```css
--pw-primary: #d32f2f;
--pw-primary-dark: #b71c1c;
--pw-bg: #f5f5f5;
--pw-card: #ffffff;
--pw-border-soft: #eadada;
```

Style expectations:

- Use the existing red gradient header style.
- Use existing `card`, `btn-pill`, `page`, `page-header`, `page-body`, `page-footer`, `nav-link`, and layout classes where possible.
- Keep pages visually consistent with the current portal, not a new design system.
- Prefer rounded cards, soft borders, subtle shadows, clear spacing, and practical field-device readability.
- Do not introduce Tailwind, Bootstrap, Material UI, or other UI libraries unless specifically requested.
- Avoid hard-coded one-off inline styles when a reusable class is better.
- Be careful with global CSS. `App.css` is large and shared across many pages, so targeted selectors are preferred.

## Mobile and Field-Device Rules

Mobile usability is critical.

When making UI changes:

- Check behaviour at `max-width: 768px` and around phone widths.
- Avoid horizontal wobble and accidental page-level scrolling.
- Preserve the app-like mobile feel: fixed root, scroll inside `.main-content`, safe-area handling, and contained overscroll.
- Ensure modals, PDF viewers, maps drawers, and sticky panels can scroll on mobile.
- Use `font-size: 16px` for mobile inputs/selects/textareas where needed to prevent iOS zoom.
- Keep buttons large enough to tap, but not oversized or elongated.
- Keep important buttons visible and not hidden behind the header, footer, keyboard, or safe area.
- Use `env(safe-area-inset-*)` where relevant for bottom or top controls.

Do not remove existing mobile patches unless replacing them with something tested and better.

## Auth and Admin Rules

Auth is sensitive. Be conservative.

`AuthContext.jsx` is the source of truth for:

- Supabase session user
- profile row
- normalised role: `admin` or `basic`
- `isAdmin`
- `authReady`
- `profileLoading`
- active-user enforcement
- token refresh behaviour
- last-login updates
- live deactivation handling

Important rules:

- Do not reintroduce fragile string checks like `role === "ADMIN"` in components. Use `isAdmin` from `useAuth()`.
- Admin pages should appear for admins immediately after login and after refresh once permissions are resolved.
- Basic users must never see or access admin-only pages.
- Do not clear `user` or `profile` on transient Supabase/network issues unless there is a confirmed logout, inactive profile, or no session.
- Preserve the profile fetch timeout/retry pattern unless deliberately improving it.
- Preserve `/reset-password` access without requiring login.
- If changing `ProtectedRoute.jsx`, test both admin and basic flows.

Admin-only routes currently include at least:

- `/admin`
- `/job-planning`

Admin-only sidebar items must be gated by `isAdmin`.

## Routing and App Shell Rules

`App.jsx` defines the main portal shell.

Current expectations:

- Most page components are lazy-loaded with `React.lazy` and `Suspense`.
- `Login` and `ResetPassword` are auth pages and should not show the normal sidebar layout.
- The sidebar supports desktop collapse and mobile slide-in drawer.
- The mobile drawer closes on route change.
- Logout uses `supabase.auth.signOut()` and navigates to `/login`.
- Notification bell appears only when not on auth pages and a user exists.

When adding a new page:

1. Add the lazy import near other page imports.
2. Add the route in the existing route structure.
3. Add a sidebar item only if appropriate.
4. Gate admin-only pages with both sidebar visibility and `ProtectedRoute adminOnly`.
5. Keep icons and labels consistent with the existing sidebar style.

## Supabase Rules

Use the existing Supabase client from:

```js
import { supabase } from "../lib/supabaseClient.js";
```

or the appropriate relative path.

Do not create duplicate Supabase clients in page files.

Supabase project patterns known in this portal:

- Auth users have matching rows in `profiles`.
- `profiles.role` is normalised to `admin` or `basic`.
- `profiles.is_active` controls access.
- Jobs, clients, documents, schedules, timesheets, Take 5, vehicle prestart, notifications, and map-related data are stored in Supabase tables.
- RLS is expected to enforce permissions; frontend checks are not a substitute for RLS.

When changing Supabase logic:

- Keep queries narrow: select only needed columns where practical.
- Handle errors clearly with user-facing messages where needed and console warnings for diagnostics.
- Avoid excessive re-fetching.
- Avoid queries inside loops where one batched query would work.
- Consider loading, empty, and error states.
- Do not expose service-role keys or secrets in frontend code.
- Do not hard-code Supabase URLs or keys. Use env variables.

## Maps Page Rules

`src/pages/Maps.jsx` is one of the most complex parts of the portal. Treat it carefully.

The maps page uses:

- Google Maps JavaScript API
- MarkerClusterer
- Supabase job data
- Landgate/ArcGIS GeoJSON layers
- map panels/drawers/tools styled from `App.css`
- WA-focused projection/coordinate logic using `proj4`

Important behaviours to preserve:

- Existing layers, markers, popups, hover labels, search, selected job/address cards, tools, and exports.
- Google Maps instance should not be duplicated unnecessarily.
- Avoid unnecessary full map re-renders.
- Keep layer fetching throttled/debounced where implemented.
- Preserve mobile map drawer behaviour and floating tools.
- Preserve map height handling on mobile using `100dvh`, safe areas, and `.maps-mapwrap` logic.
- Do not break Landgate layer queries or projection/export logic.

When changing Maps:

- Prefer small targeted edits.
- Do not rewrite the map component unless specifically asked.
- Be careful with `useEffect` dependencies; avoid loops that repeatedly recreate maps, markers, or listeners.
- Clean up Google Maps listeners/markers/InfoWindows where applicable.
- Maintain fast load and responsiveness.
- Test desktop and mobile layouts.

## Jobs and Job Search Rules

Jobs are central to the portal.

Known job fields/patterns include:

- `job_number`
- `full_address`
- `suburb`
- `local_authority`
- `job_category`
- `job_type_legacy`
- `assigned_to`
- `priority`
- `status`
- client/contact fields
- Google place/address fields
- MGA coordinates/zone fields

When changing Jobs-related pages:

- Preserve existing search behaviour unless asked to change it.
- Job number search should prioritise exact job number matches where appropriate.
- Keep client/address/suburb fallback logic robust.
- Maintain admin/basic permissions.
- Avoid changing database field names unless a migration/update plan is included.

## Job Planning Rules

`JobPlanning.jsx` is admin-only and highly customised.

Preserve:

- Monthly calendar layout.
- Monday-start weeks.
- 6-week/42-day grid behaviour.
- Unscheduled jobs panel.
- Drag-and-drop movement/reordering.
- Confirmation behaviour when moving between day and unscheduled.
- Weather display and caching behaviour where implemented.
- Print layout and legend.
- Mobile layout for editor/actions.

When changing drag-and-drop:

- Avoid regressions that duplicate jobs, lose origin removal, or close modals unexpectedly.
- Confirm cross-bucket moves only where existing UX expects confirmation.
- Keep mobile drag handles usable.

## Schedule Rules

`Schedule.jsx` is a weekly Monday-start schedule with people, statuses, jobs, regions, notes, weather, and print output.

Preserve:

- Status colours and legend.
- Field/office/away/leave/course/hold/non-work behaviours.
- Monday-start week navigation.
- Staff/person ordering and profile filtering.
- Job autocomplete/search patterns.
- Print colours and default PDF/print usability.
- Mobile horizontal scroll and sticky first column behaviour.

## Timesheets Rules

Timesheets use fortnight periods anchored to a known Monday and support locking.

Preserve:

- Fortnight period calculation.
- Basic users can only edit unlocked periods.
- Admins can view/select staff and unlock as required.
- Locking behaviour and lock messages.
- CSV export format.
- Saved/locked state indicators.

## Take 5 and Vehicle Prestart Rules

These pages are used in the field. Prioritise reliability and mobile usability.

Preserve:

- Step flows.
- Warning/confirmation behaviour.
- Photo/file input handling.
- PDF/export output.
- Register filters and default current-user behaviour where implemented.
- Job search consistency with other pages.

## Documents and PDF Viewer Rules

Documents may include PDFs and Word files.

When changing document viewers:

- Mobile must be able to scroll the document.
- Close/back controls must remain visible on mobile.
- Upload/delete/version buttons should retain normal sizing and current style.
- Show success/error messages briefly and clearly.

## Notification Rules

The user prefers in-app notifications, not email notifications.

Do not add email notifications unless explicitly requested.

## Performance Rules

Performance is important across the portal, especially Maps, Job Planning, Schedule, Documents, and large Supabase lists.

General rules:

- Keep lazy loading for large pages.
- Avoid importing heavy modules globally when they are only used by one page.
- Avoid unnecessary state updates and useEffect loops.
- Debounce expensive searches or map/layer refreshes.
- Batch Supabase requests where practical.
- Avoid adding new dependencies unless they provide clear value.
- Do not move large page-specific CSS into global selectors that affect all pages.

## Safety and Robustness Rules

For every code change:

- Think through loading, empty, error, and retry states.
- Do not silently swallow important errors.
- Keep console warnings useful but not noisy.
- Preserve existing data and avoid destructive actions without confirmation.
- Never hard-code secrets.
- Never commit `.env.local`, Supabase service keys, or private credentials.
- Keep database writes explicit and minimal.
- For delete/clear actions, preserve confirmations where appropriate.

## Working Style for Codex

Before editing:

1. Read the relevant files first.
2. Summarise the intended change and affected files.
3. Identify risks, especially auth, Supabase writes, Maps performance, mobile layout, and global CSS.
4. Prefer the smallest safe change.

While editing:

- Keep changes focused on the requested task.
- Do not perform unrelated cleanup.
- Preserve comments that explain important behaviour.
- Add comments only where they clarify non-obvious logic.
- Reuse existing components and CSS classes.
- Avoid major rewrites unless specifically requested.

After editing:

1. Run `npm run build`.
2. Run `npm run lint` if practical.
3. Summarise changed files.
4. Explain how to test the change on desktop and mobile.
5. Call out any risks, assumptions, or follow-up improvements.

## Definition of Done

A task is done only when:

- The requested behaviour works.
- Existing behaviour is preserved.
- The portal builds successfully with `npm run build`.
- There are no new obvious console errors.
- Desktop layout still works.
- Mobile layout still works.
- Auth/admin behaviour is not regressed.
- Supabase queries and writes are safe and intentional.
- The solution fits the current Pro West Portal style.

## Preferred Response Format from Codex

When completing a task, respond with:

1. Short summary of what changed.
2. Files changed.
3. Build/lint result.
4. Manual test checklist.
5. Risks or notes.

Example:

```text
Summary:
- Embedded Maps in the portal layout while preserving existing map tools and mobile drawer.

Files changed:
- src/App.jsx
- src/pages/Maps.jsx
- src/App.css

Checks:
- npm run build: passed
- npm run lint: not run / passed

Manual test:
- Desktop: open Maps, toggle drawer, search job, enable layers.
- Mobile: open Maps, use hamburger/drawer, confirm map height and tools.

Notes:
- No Supabase schema changes.
```

## Project-Specific Warning Areas

Be extra careful with these areas:

- `AuthContext.jsx`
- `ProtectedRoute.jsx`
- `App.jsx` sidebar/admin visibility
- `Maps.jsx`
- global `App.css` mobile and print sections
- `JobPlanning.jsx` drag/drop and print
- `Schedule.jsx` print/mobile table behaviour
- Supabase RLS-sensitive pages
- PDF/mobile document viewers
- destructive actions such as clear list/delete/delete version/archive

## Owner Preferences

The owner prefers:

- Exact, practical changes.
- Minimal disruption.
- Robust behaviour over clever rewrites.
- Consistent style/theme.
- Fast portal load and smooth mobile use.
- In-app notifications only.
- Clear explanations of where and why changes were made.

