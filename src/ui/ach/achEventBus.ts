/**
 * Global event bus for ACH status updates.
 * Allows any component to notify others when ACH status changes.
 */

type AchUpdateListener = (vendorName: string) => void;

const listeners = new Set<AchUpdateListener>();

export function subscribeToAchUpdates(listener: AchUpdateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyAchUpdate(vendorName: string) {
  console.log(`📢 ACH Update Event: ${vendorName}`);
  listeners.forEach(listener => {
    try {
      listener(vendorName);
    } catch (e) {
      console.error('Error in ACH update listener:', e);
    }
  });
}

