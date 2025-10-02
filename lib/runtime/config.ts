import path from 'path';

export function getDataDir() {
  const envDir = process.env.PCS_DATA_DIR;
  if (envDir && envDir.trim()) return envDir.trim();
  throw new Error('PCS_DATA_DIR is not set');
}

export function pathTo(file: string) {
  return path.join(getDataDir(), file);
}

export function getVendorMapPath() {
  return pathTo('vendor_stripe_map.json');
}


