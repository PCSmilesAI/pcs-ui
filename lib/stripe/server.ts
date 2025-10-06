import Stripe from 'stripe';

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret) throw new Error('[Stripe] STRIPE_SECRET_KEY is missing');

export const stripe = new Stripe(secret, { apiVersion: '2024-06-20' });




