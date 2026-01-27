import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const mobileMode =
    process.env.MOBILE_MODE === "1" || process.env.MOBILE_MODE === "true";

  const disableHmr =
    process.env.DISABLE_HMR === "1" || process.env.DISABLE_HMR === "true";

  return {
    plugins: [react()],

    resolve: {
      alias: {
        react: path.resolve("./node_modules/react"),
        "react-dom": path.resolve("./node_modules/react-dom"),
      },
    },

    server: {
      host: true,
      port: 5173,
      strictPort: true,
      hmr: disableHmr
        ? false
        : { clientPort: 5173, overlay: mobileMode ? false : true },
      watch: { usePolling: false },
    },

    preview: { host: true, port: 4173, strictPort: true },
  };
});
