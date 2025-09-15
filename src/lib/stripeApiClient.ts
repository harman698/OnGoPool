/**
 * Stripe API Client Service
 * FIXED: Proper client-side Stripe integration with real payment intent creation
 */

import { loadStripe } from '@stripe/stripe-js';

// Payment Intent types
interface PaymentIntentData {
  amount: number;
  currency: string;
  capture_method: 'automatic' | 'manual';
  booking_id: number;
  user_id: string;
  payment_method_id?: string;
}

interface PaymentIntentResult {
  payment_intent: any; // Stripe.PaymentIntent
  client_secret: string;
}

interface PaymentActionResult {
  payment_intent?: any; // Stripe.PaymentIntent
  refund?: any; // Stripe.Refund
  amount_processed?: number;
}

/**
 * Stripe API Client Class
 * FIXED: Uses proper client-side approach with real backend API creation
 */
export class StripeAPIClient {
  private baseURL: string;
  private stripePromise: Promise<any> | null = null;

  constructor(baseURL: string = '/api/stripe') {
    this.baseURL = baseURL;
  }

  /**
   * Get Stripe client instance
   */
  private async getStripe() {
    if (!this.stripePromise) {
      this.stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
    }
    
    const stripe = await this.stripePromise;
    if (!stripe) {
      throw new Error('Failed to initialize Stripe client');
    }
    
    return stripe;
  }

  /**
   * Create Payment Intent for Authorization Hold
   * LIVE PAYMENTS ONLY: Creates payment intent via backend API - no fallback to mock
   */
  async createPaymentIntent(data: PaymentIntentData): Promise<PaymentIntentResult> {
    try {
      console.log('Creating LIVE Stripe Payment Intent via backend API');
      console.log('Amount:', data.amount, 'CAD, Booking ID:', data.booking_id);

      // Create payment intent via backend API endpoint (live payments only)
      const response = await fetch(`${this.baseURL}/payment-intents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: data.amount, // Amount in dollars
          currency: data.currency,
          capture_method: data.capture_method,
          booking_id: data.booking_id,
          user_id: data.user_id,
          payment_method_id: data.payment_method_id
        }),
      });

      // Require successful backend API response for live payments
      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType?.includes('application/json')) {
        throw new Error('Backend API is required for live payments. Please ensure the backend is deployed and accessible.');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create payment intent');
      }

      console.log('✅ LIVE Stripe Payment Intent created via backend!');
      console.log('Payment Intent ID:', result.data.payment_intent.id);
      console.log('Client Secret available for confirmation');
      console.log('🔗 This payment will appear in your Stripe dashboard!');

      return {
        payment_intent: result.data.payment_intent,
        client_secret: result.data.client_secret
      };

    } catch (error) {
      console.error('LIVE Payment API error:', error);
      throw new Error(`Failed to create live payment: ${error.message || error}`);
    }
  }

  /**
   * REMOVED: Mock Payment Intent Creation
   * Live payments only - no mock fallback system
   */

  /**
   * Confirm Payment with Card Element
   * LIVE PAYMENTS ONLY: Real Stripe payment confirmation only
   */
  async confirmPayment(clientSecret: string, cardElement: any, paymentMethodData?: any): Promise<any> {
    try {
      console.log('🔄 Confirming LIVE payment with Stripe...');
      
      const stripe = await this.getStripe();
      
      // Live Stripe payment confirmation only
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: paymentMethodData || {
          card: cardElement,
        },
      });

      if (error) {
        console.error('LIVE payment confirmation error:', error);
        throw new Error(error.message);
      }

      console.log('✅ LIVE payment confirmed successfully!');
      console.log('Payment Intent ID:', paymentIntent.id);
      console.log('Status:', paymentIntent.status);
      console.log('Amount:', paymentIntent.amount_received / 100, paymentIntent.currency.toUpperCase());
      console.log('🔗 Payment visible in Stripe dashboard!');

      return paymentIntent;

    } catch (error) {
      console.error('LIVE payment confirmation failed:', error);
      throw error;
    }
  }

  /**
   * Capture Payment Intent (Convert Authorization to Charge)
   * LIVE PAYMENTS ONLY: Requires backend API for security
   */
  async capturePaymentIntent(
    paymentIntentId: string,
    amountToCapture?: number
  ): Promise<PaymentActionResult> {
    try {
      console.log('Attempting to capture LIVE payment:', paymentIntentId);
      
      // Live payment capture via backend API only
      const response = await fetch(`${this.baseURL}/payment-intents/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment_intent_id: paymentIntentId,
          amount_to_capture: amountToCapture,
        }),
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType?.includes('application/json')) {
        throw new Error('Backend API is required for live payment capture. Please ensure the backend is deployed and accessible.');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to capture payment');
      }

      console.log('✅ LIVE payment captured via backend API');
      console.log('Payment Intent ID:', result.data.payment_intent.id);
      console.log('Amount captured:', (result.data.payment_intent.amount_received / 100), 'CAD');
      return result.data;

    } catch (error) {
      console.error('LIVE payment capture error:', error);
      throw error;
    }
  }

  /**
   * Cancel Payment Intent (Void Authorization)
   * LIVE PAYMENTS ONLY: Requires backend API for security
   */
  async cancelPaymentIntent(
    paymentIntentId: string,
    cancellationReason?: string
  ): Promise<PaymentActionResult> {
    try {
      console.log('Attempting to cancel LIVE payment:', paymentIntentId);
      
      // Live payment cancellation via backend API only
      const response = await fetch(`${this.baseURL}/payment-intents/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment_intent_id: paymentIntentId,
          cancellation_reason: cancellationReason,
        }),
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType?.includes('application/json')) {
        throw new Error('Backend API is required for live payment cancellation. Please ensure the backend is deployed and accessible.');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to cancel payment');
      }

      console.log('✅ LIVE payment cancelled via backend API');
      console.log('Payment Intent ID:', result.data.payment_intent.id);
      console.log('Status:', result.data.payment_intent.status);
      return result.data;

    } catch (error) {
      console.error('LIVE payment cancellation error:', error);
      throw error;
    }
  }

  /**
   * Create Refund for Captured Payment
   * LIVE PAYMENTS ONLY: Requires backend API for security
   */
  async createRefund(
    paymentIntentId: string,
    amount?: number,
    reason?: string
  ): Promise<PaymentActionResult> {
    try {
      console.log('Attempting to refund LIVE payment:', paymentIntentId);
      
      // Live refund via backend API only
      const response = await fetch(`${this.baseURL}/refunds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment_intent_id: paymentIntentId,
          amount: amount,
          reason: reason,
        }),
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok || !contentType?.includes('application/json')) {
        throw new Error('Backend API is required for live payment refunds. Please ensure the backend is deployed and accessible.');
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to create refund');
      }

      console.log('✅ LIVE refund created via backend API');
      console.log('Refund ID:', result.data.refund.id);
      console.log('Amount refunded:', (result.data.refund.amount / 100), 'CAD');
      return result.data;

    } catch (error) {
      console.error('LIVE refund creation error:', error);
      throw error;
    }
  }

  /**
   * Retrieve Payment Intent
   * LIVE PAYMENTS ONLY: Requires backend implementation for security
   */
  async getPaymentIntent(paymentIntentId: string): Promise<PaymentIntentResult> {
    try {
      console.log('Retrieving LIVE payment intent:', paymentIntentId);

      // Note: Client-side can only retrieve payment intents with client secret
      // This is mainly for status checking after confirmation
      throw new Error('Payment intent retrieval requires backend implementation for security');

    } catch (error) {
      console.error('Error retrieving LIVE payment intent:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const stripeAPIClient = new StripeAPIClient();

// Export types for use in other files
export type {
  PaymentIntentData,
  PaymentIntentResult,
  PaymentActionResult,
};