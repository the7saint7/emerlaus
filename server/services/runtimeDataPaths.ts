import path from "node:path";

const RUNTIME_DATA_DIR_ENV_KEYS = [
  "EMERLAUS_DATA_DIR",
  "DATA_DIR"
] as const;

function getConfiguredRuntimeDataRoot(): string | null {
  for (const key of RUNTIME_DATA_DIR_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value != null && value !== "") {
      return path.resolve(value);
    }
  }

  return null;
}

export function getRuntimeDataRoot(): string {
  return getConfiguredRuntimeDataRoot() ?? process.cwd();
}

export function resolveRuntimeDataPath(...segments: string[]): string {
  return path.join(getRuntimeDataRoot(), ...segments);
}
