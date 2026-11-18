/** PM2 — farukdemirtas.com/esnaf */
const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const cwd = "/var/www/esnaf-tedarik";
const fileEnv = { ...loadEnvFile(path.join(cwd, ".env")), ...loadEnvFile(path.join(cwd, ".env.production")) };

module.exports = {
  apps: [
    {
      name: "esnaf-tedarik",
      cwd,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3020",
      env: {
        ...fileEnv,
        NODE_ENV: "production",
        PORT: "3020",
        NEXT_PUBLIC_BASE_PATH: "/esnaf",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "450M",
    },
    {
      name: "esnaf-tedarik-worker",
      cwd,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/worker.ts",
      env: {
        ...fileEnv,
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: "200M",
    },
  ],
};
