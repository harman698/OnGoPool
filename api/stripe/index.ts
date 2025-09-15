/**
 * Stripe API Index
 * Main entry point for Stripe API routes
 * Vercel serverless function for routing Stripe requests
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Main router function for Stripe API
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req;

  // Route to specific handlers based on path
  if (url?.includes('/payment-intents')) {
    const { default: paymentIntentsHandler } = await import('./payment-intents');
    return paymentIntentsHandler(req, res);
  }

  if (url?.includes('/customers') || url?.includes('/payment-methods') || url?.includes('/setup-intents')) {
    const { default: customerHandler } = await import('./customer-management');
    return customerHandler(req, res);
  }

  if (url?.includes('/webhooks')) {
    const { default: webhookHandler } = await import('./webhooks');
    return webhookHandler(req, res);
  }

  return res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    timestamp: new Date().toISOString(),
    statusCode: 404
  });
}