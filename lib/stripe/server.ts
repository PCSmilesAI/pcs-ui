import Stripe from 'stripe';

/**
 * Stripe client singleton with lazy initialization.
 * Does NOT throw at import time - allows build to succeed even without env vars.
 * Throws only when getStripe() is called without a valid key.
 */

let stripeInstance: Stripe | null = null;

/**
 * Get the Stripe client instance.
 * @throws Error if STRIPE_SECRET_KEY is not configured
 */
export function getStripe(): Stripe {
  if (stripeInstance) {
    return stripeInstance;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error('[Stripe] STRIPE_SECRET_KEY is missing');
  }

  stripeInstance = new Stripe(secret, { apiVersion: '2024-06-20' });
  return stripeInstance;
}

/**
 * Get the Stripe client if configured, or null if not.
 * Use this for optional Stripe functionality that shouldn't fail.
 */
export function getStripeOrNull(): Stripe | null {
  if (stripeInstance) {
    return stripeInstance;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return null;
  }

  stripeInstance = new Stripe(secret, { apiVersion: '2024-06-20' });
  return stripeInstance;
}

/**
 * Check if Stripe is configured (key is present).
 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// For backwards compatibility - export a getter that returns the instance
// This will throw at access time rather than import time if not configured
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const instance = getStripe();
    return (instance as any)[prop];
  },
});
