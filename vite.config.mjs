import { createRequire } from "node:module";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const require = createRequire(import.meta.url);
const { app } = require("./server.js");

export default defineConfig({
  plugins: [
    svelte(),
    {
      name: "express-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith("/api")) {
            app(req, res, next);
            return;
          }
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.startsWith("/api")) {
            app(req, res, next);
            return;
          }
          next();
        });
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
