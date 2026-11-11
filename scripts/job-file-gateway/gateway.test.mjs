import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createGateway, pathParts, validJobNumber } from "./gateway.mjs";

test("job and path validation rejects path injection", () => {
  assert.equal(validJobNumber("9170"), true);
  for (const value of ["0", "09170", "2147483648", "9170/..", "9170?x=1"]) {
    assert.equal(validJobNumber(value), false);
  }
  assert.deepEqual(pathParts("DOCS/RECEIVED"), ["DOCS", "RECEIVED"]);
  for (const value of ["../9171", "DOCS/../9171", "DOCS\\other", "DOCS//other", "C:/Windows"]) {
    assert.throws(() => pathParts(value));
  }
});

test("gateway rejects a service-role key", () => {
  const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
  assert.throws(() => createGateway({
    rootPath: tmpdir(),
    supabaseUrl: "https://supabase.test",
    supabaseAnonKey: "header." + payload + ".signature",
    publicUrl: "https://gateway.test",
    portalOrigins: ["https://portal.test"],
  }), /privileged key/);
});

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "pw-job-files-"));
  await mkdir(path.join(root, "9170", "DOCS"), { recursive: true });
  await mkdir(path.join(root, "9171"), { recursive: true });
  await writeFile(path.join(root, "9170", "DOCS", "note.txt"), "hello job 9170");
  await writeFile(path.join(root, "9171", "private.txt"), "other job");
  t.after(() => rm(root, { recursive: true, force: true }));
  let active = true;
  let clock = 100_000;
  const fetchImpl = async (address, options) => {
    if (options.headers.Authorization !== "Bearer valid-token") {
      return Response.json({}, { status: 401 });
    }
    const url = new URL(address);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "user-1" });
    if (url.pathname === "/rest/v1/profiles") {
      return Response.json([{ id: "user-1", role: "basic", is_active: active }]);
    }
    if (url.pathname === "/rest/v1/jobs") {
      return Response.json(url.searchParams.get("job_number") === "eq.9170" ?
        [{ id: "job-1", job_number: 9170 }] : []);
    }
    return Response.json({}, { status: 404 });
  };
  const server = createGateway({
    rootPath: root,
    supabaseUrl: "https://supabase.test",
    supabaseAnonKey: "public-test-key",
    publicUrl: "http://127.0.0.1:9999",
    portalOrigins: ["https://portal.test"],
    allowInsecureHttp: true,
  }, { fetchImpl, now: () => clock });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    base: "http://127.0.0.1:" + server.address().port,
    root,
    setActive: (value) => { active = value; },
    advance: (milliseconds) => { clock += milliseconds; },
  };
}

test("health checks that the configured job root is available", async (t) => {
  const app = await fixture(t);
  assert.equal((await fetch(app.base + "/health")).status, 200);
  await rm(app.root, { recursive: true, force: true });
  assert.equal((await fetch(app.base + "/health")).status, 503);
});

async function launch(base, jobNumber = "9170", token = "valid-token") {
  return fetch(base + "/api/launch", {
    method: "POST",
    headers: {
      Origin: "https://portal.test",
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobNumber }),
  });
}

test("only active portal users can launch an existing job", async (t) => {
  const app = await fixture(t);
  assert.equal((await launch(app.base, "9170", "wrong-token")).status, 401);
  assert.equal((await launch(app.base, "9171")).status, 404);
  assert.equal((await launch(app.base, "../9170")).status, 400);
  const wrongOrigin = await fetch(app.base + "/api/launch", {
    method: "POST",
    headers: { Origin: "https://other.test", Authorization: "Bearer valid-token" },
    body: JSON.stringify({ jobNumber: "9170" }),
  });
  assert.equal(wrongOrigin.status, 403);
  assert.equal(wrongOrigin.headers.get("access-control-allow-origin"), null);
  app.setActive(false);
  assert.equal((await launch(app.base)).status, 403);
});

test("a one-use link opens only its job and streams file ranges", async (t) => {
  const app = await fixture(t);
  const response = await launch(app.base);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://portal.test");
  const { url } = await response.json();
  const launchPath = new URL(url).pathname;
  const redeem = await fetch(app.base + launchPath, { redirect: "manual" });
  assert.equal(redeem.status, 303);
  assert.equal(redeem.headers.get("location"), "/jobs/9170/");
  const cookie = redeem.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(app.base + launchPath, { redirect: "manual" })).status, 401);
  const headers = { Cookie: cookie };
  const listing = await fetch(app.base + "/jobs/9170/", { headers });
  assert.equal(listing.status, 200);
  const listingText = await listing.text();
  assert.match(listingText, /DOCS/);
  assert.doesNotMatch(listingText, /private\.txt/);
  const nested = await fetch(app.base + "/jobs/9170/?path=DOCS", { headers });
  assert.match(await nested.text(), /note\.txt/);
  const ranged = await fetch(app.base + "/jobs/9170/file?path=DOCS%2Fnote.txt", {
    headers: { ...headers, Range: "bytes=0-4" },
  });
  assert.equal(ranged.status, 206);
  assert.equal(await ranged.text(), "hello");
  assert.equal((await fetch(app.base + "/jobs/9170/file?path=..%2F9171%2Fprivate.txt",
    { headers })).status, 400);
  assert.equal((await fetch(app.base + "/jobs/9171/", { headers })).status, 401);
  app.advance(61_000);
  app.setActive(false);
  assert.equal((await fetch(app.base + "/jobs/9170/", { headers })).status, 403);
});
