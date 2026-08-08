import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages serves this repo from /Guardian/, so assets need that prefix.
// Vercel and Netlify serve from the root, where the prefix would break them —
// hence the switch rather than a hardcoded base.
const base = process.env.DEPLOY_TARGET === "ghpages" ? "/Guardian/" : "/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
});
