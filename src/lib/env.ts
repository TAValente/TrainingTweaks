import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let loaded = false;

export function loadLocalEnv() {
  if (loaded) return;
  loaded = true;

  loadEnvFile(join(process.cwd(), ".env.local"));
  loadEnvFile(join(process.cwd(), "local.env"));
}

function loadEnvFile(envPath: string) {
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

export function getRequiredEnv(name: string) {
  loadLocalEnv();
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getOptionalEnv(name: string, fallback?: string) {
  loadLocalEnv();
  return process.env[name] || fallback;
}
