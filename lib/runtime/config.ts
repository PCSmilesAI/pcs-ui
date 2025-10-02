import path from 'path';

export function getDataDir() {
  const envDir = process.env.PCS_DATA_DIR;
  if (envDir && envDir.trim()) return envDir.trim();
  return path.join(process.cwd(), 'pcs_ai_data');
}

export function getVendorMapPath() {
  return path.join(getDataDir(), 'vendor_stripe_map.json');
}


