import path from 'path';
import fs from 'fs';

let resolvedDir: string | null = null;

function resolveDataDir(): string {
  if (resolvedDir) return resolvedDir;

  let envDir = process.env.PCS_DATA_DIR?.trim();
  if (!envDir) {
    envDir = path.resolve(process.cwd(), 'pcs_ui_data');
    process.env.PCS_DATA_DIR = envDir;
  }

  if (!path.isAbsolute(envDir)) {
    envDir = path.resolve(process.cwd(), envDir);
    process.env.PCS_DATA_DIR = envDir;
  }

  resolvedDir = envDir;
  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }
  return resolvedDir;
}

export function getDataDir(): string {
  return resolveDataDir();
}

export function resolveDataPath(...segments: string[]): string {
  return path.join(resolveDataDir(), ...segments);
}
