/**
 * Stripe Payment Intents API Endpoint
 * Vercel serverless function for creating and managing Stripe payment intents
 */

import Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Initialize Stripe with secret key from environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// Request interfaces
interface CreatePaymentIntentRequest {
  amount: number; // Amount in dollars (will be converted to cents)
  currency: string;
  capture_method: 'automatic' | 'manual';
  booking_id: number;
  user_id: string;
  payment_method_id?: string; // Optional saved payment method
}

interface CapturePaymentIntentRequest {
  payment_intent_id: string;
  amount_to_capture?: number; // Optional partial capture amount in dollars
}

interface CancelPaymentIntentRequest {
  payment_intent_id: string;
  cancellation_reason?: string;
}

interface RefundPaymentRequest {
  payment_intent_id: string;
  amount?: number; // Optional partial refund amount in dollars
  reason?: string;
}

// Response interfaces
interface PaymentIntentResponse {
  success: boolean;
  payment_intent?: Stripe.PaymentIntent;
  client_secret?: string;
  error?: string;
}

interface PaymentActionResponse {
  success: boolean;
  payment_intent?: Stripe.PaymentIntent;
  refund?: Stripe.Refund;
  amount_processed?: number;
  error?: string;
}

/**
 * Create Payment Intent for Authorization Hold
 * POST /api/stripe/payment-intents
 */
export async function createPaymentIntent(
  request: CreatePaymentIntentRequest
): Promise<PaymentIntentResponse> {
  try {
    // Input validation
    if (!request.amount || request.amount <= 0) {
      return {
        success: false,
        error: 'Invalid amount specified'
      };
    }

    if (!request.booking_id || !request.user_id) {
      return {
        success: false,
        error: 'Missing required booking or user information'
      };
    }

    // Convert amount to cents for Stripe
    const amountInCents = Math.round(request.amount * 100);

    // Create payment intent with authorization hold
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountInCents,
      currency: request.currency.toLowerCase(),
      capture_method: request.capture_method,
      metadata: {
        booking_id: request.booking_id.toString(),
        user_id: request.user_id,
        app: 'OnGoPool',
        created_at: new Date().toISOString()
      },
      automatic_payment_methods: {
        enabled: true,
      },
    };

    // Use saved payment method if provided
    if (request.payment_method_id) {
      paymentIntentParams.payment_method = request.payment_method_id;
      paymentIntentParams.confirm = true; // Auto-confirm with saved payment method
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    return {
      success: true,
      payment_intent: paymentIntent,
      client_secret: paymentIntent.client_secret!
    };

  } catch (error) {
    console.error('Error creating payment intent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment authorization'
    };
  }
}

/**
 * Capture Payment Intent (Convert Authorization to Charge)
 * POST /api/stripe/payment-intents/capture
 */
export async function capturePaymentIntent(
  request: CapturePaymentIntentRequest
): Promise<PaymentActionResponse> {
  try {
    // Input validation
    if (!request.payment_intent_id) {
      return {
        success: false,
        error: 'Payment intent ID is required'
      };
    }

    // Get current payment intent status
    const paymentIntent = await stripe.paymentIntents.retrieve(request.payment_intent_id);

    // Check if payment intent is in capturable state
    if (paymentIntent.status !== 'requires_capture') {
      return {
        success: false,
        error: `Payment intent cannot be captured. Current status: ${paymentIntent.status}`
      };
    }

    // Calculate capture amount
    let captureAmount = paymentIntent.amount;
    if (request.amount_to_capture) {
      captureAmount = Math.round(request.amount_to_capture * 100);
      
      // Validate capture amount doesn't exceed authorized amount
      if (captureAmount > paymentIntent.amount) {
        return {
          success: false,
          error: 'Capture amount cannot exceed authorized amount'
        };
      }
    }

    // Capture the payment
    const capturedPayment = await stripe.paymentIntents.capture(
      request.payment_intent_id,
      captureAmount < paymentIntent.amount ? { amount_to_capture: captureAmount } : {}
    );

    return {
      success: true,
      payment_intent: capturedPayment,
      amount_processed: captureAmount / 100 // Convert back to dollars
    };

  } catch (error) {
    console.error('Error capturing payment intent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to capture payment'
    };
  }
}

/**
 * Cancel Payment Intent (Void Authorization)
 * POST /api/stripe/payment-intents/cancel
 */
export async function cancelPaymentIntent(
  request: CancelPaymentIntentRequest
): Promise<PaymentActionResponse> {
  try {
    // Input validation
    if (!request.payment_intent_id) {
      return {
        success: false,
        error: 'Payment intent ID is required'
      };
    }

    // Get current payment intent status
    const paymentIntent = await stripe.paymentIntents.retrieve(request.payment_intent_id);

    // Check if payment intent can be cancelled
    if (!['requires_payment_method', 'requires_capture', 'requires_confirmation', 'requires_action'].includes(paymentIntent.status)) {
      return {
        success: false,
        error: `Payment intent cannot be cancelled. Current status: ${paymentIntent.status}`
      };
    }

    // Add cancellation reason to metadata if provided
    let updateParams: Stripe.PaymentIntentUpdateParams = {};
    if (request.cancellation_reason) {
      updateParams.metadata = {
        ...paymentIntent.metadata,
        cancellation_reason: request.cancellation_reason,
        cancelled_at: new Date().toISOString()
      };
    }

    // Update metadata if provided, then cancel
    if (Object.keys(updateParams).length > 0) {
      await stripe.paymentIntents.update(request.payment_intent_id, updateParams);
    }

    const cancelledPayment = await stripe.paymentIntents.cancel(request.payment_intent_id);

    return {
      success: true,
      payment_intent: cancelledPayment,
      amount_processed: 0 // No money was captured
    };

  } catch (error) {
    console.error('Error cancelling payment intent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel payment authorization'
    };
  }
}

/**
 * Create Refund for Captured Payment
 * POST /api/stripe/refunds
 */
export async function createRefund(
  request: RefundPaymentRequest
): Promise<PaymentActionResponse> {
  try {
    // Input validation
    if (!request.payment_intent_id) {
      return {
        success: false,
        error: 'Payment intent ID is required'
      };
    }

    // Get payment intent to validate it's refundable
    const paymentIntent = await stripe.paymentIntents.retrieve(request.payment_intent_id);

    if (paymentIntent.status !== 'succeeded') {
      return {
        success: false,
        error: `Payment cannot be refunded. Current status: ${paymentIntent.status}`
      };
    }

    // Calculate refund amount
    let refundAmount = paymentIntent.amount_received;
    if (request.amount) {
      refundAmount = Math.round(request.amount * 100);
      
      // Validate refund amount doesn't exceed captured amount
      if (refundAmount > paymentIntent.amount_received) {
        return {
          success: false,
          error: 'Refund amount cannot exceed captured amount'
        };
      }
    }

    // Create refund parameters
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: request.payment_intent_id,
      amount: refundAmount,
      metadata: {
        booking_id: paymentIntent.metadata.booking_id || '',
        user_id: paymentIntent.metadata.user_id || '',
        refund_reason: request.reason || 'requested',
        refunded_at: new Date().toISOString()
      }
    };

    // Create the refund
    const refund = await stripe.refunds.create(refundParams);

    return {
      success: true,
      refund: refund,
      amount_processed: refundAmount / 100 // Convert back to dollars
    };

  } catch (error) {
    console.error('Error creating refund:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process refund'
    };
  }
}

/**
 * Get Payment Intent Status
 * GET /api/stripe/payment-intents/:id
 */
export async function getPaymentIntent(paymentIntentId: string): Promise<PaymentIntentResponse> {
  try {
    if (!paymentIntentId) {
      return {
        success: false,
        error: 'Payment intent ID is required'
      };
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    return {
      success: true,
      payment_intent: paymentIntent
    };

  } catch (error) {
    console.error('Error retrieving payment intent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve payment status'
    };
  }
}

/**
 * Main Vercel serverless function handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { method, url } = req;

  try {
    if (method === 'POST' && url === '/api/stripe/payment-intents') {
      const result = await createPaymentIntent(req.body);
      return res.status(result.success ? 200 : 400).json({
        success: result.success,
        data: result.success ? { payment_intent: result.payment_intent, client_secret: result.client_secret } : undefined,
        error: result.error,
        timestamp: new Date().toISOString(),
        statusCode: result.success ? 200 : 400
      });
    }

    if (method === 'POST' && url === '/api/stripe/payment-intents/capture') {
      const result = await capturePaymentIntent(req.body);
      return res.status(result.success ? 200 : 400).json({
        success: result.success,
        data: result.success ? { payment_intent: result.payment_intent, amount_processed: result.amount_processed } : undefined,
        error: result.error,
        timestamp: new Date().toISOString(),
        statusCode: result.success ? 200 : 400
      });
    }

    if (method === 'POST' && url === '/api/stripe/payment-intents/cancel') {
      const result = await cancelPaymentIntent(req.body);
      return res.status(result.success ? 200 : 400).json({
        success: result.success,
        data: result.success ? { payment_intent: result.payment_intent, amount_processed: result.amount_processed } : undefined,
        error: result.error,
        timestamp: new Date().toISOString(),
        statusCode: result.success ? 200 : 400
      });
    }

    if (method === 'POST' && url === '/api/stripe/refunds') {
      const result = await createRefund(req.body);
      return res.status(result.success ? 200 : 400).json({
        success: result.success,
        data: result.success ? { refund: result.refund, amount_processed: result.amount_processed } : undefined,
        error: result.error,
        timestamp: new Date().toISOString(),
        statusCode: result.success ? 200 : 400
      });
    }

    if (method === 'GET' && url?.startsWith('/api/stripe/payment-intents/')) {
      const paymentIntentId = url.split('/').pop();
      if (paymentIntentId) {
        const result = await getPaymentIntent(paymentIntentId);
        return res.status(result.success ? 200 : 400).json({
          success: result.success,
          data: result.success ? { payment_intent: result.payment_intent } : undefined,
          error: result.error,
          timestamp: new Date().toISOString(),
          statusCode: result.success ? 200 : 400
        });
      }
    }

    return res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      timestamp: new Date().toISOString(),
      statusCode: 404
    });

  } catch (error) {
    console.error('Stripe API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
      statusCode: 500
    });
  }
}

// Export types for client use
export type {
  CreatePaymentIntentRequest,
  CapturePaymentIntentRequest,
  CancelPaymentIntentRequest,
  RefundPaymentRequest,
  PaymentIntentResponse,
  PaymentActionResponse
};