import { createGateway } from "./gateway.mjs";

const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

const server = createGateway({
  rootPath: process.env.JOB_ROOT_PATH,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  publicUrl: process.env.GATEWAY_PUBLIC_URL,
  portalOrigins: (process.env.PORTAL_ORIGINS || "")
    .split(",").map((origin) => origin.trim()).filter(Boolean),
});

server.listen(port, "127.0.0.1", () => {
  console.log("Job file gateway listening on 127.0.0.1:" + port);
});
