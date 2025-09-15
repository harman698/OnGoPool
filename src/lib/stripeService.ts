import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe with publishable key
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  client_secret: string;
}

export interface CreatePaymentIntentData {
  amount: number;
  currency?: string;
  capture_method?: 'automatic' | 'manual';
  metadata?: Record<string, string>;
}

export class StripeService {
  private static async getStripe() {
    return await stripePromise;
  }

  /**
   * Create a Payment Intent for authorization (payment hold)
   */
  static async createPaymentIntent(data: CreatePaymentIntentData): Promise<StripePaymentIntent> {
    try {
      // Convert amount to cents (Stripe expects smallest currency unit)
      const amountInCents = Math.round(data.amount * 100);

      const response = await fetch('/api/stripe/payment-intents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountInCents,
          currency: data.currency || 'cad',
          capture_method: data.capture_method || 'manual', // Manual capture for payment holds
          metadata: data.metadata || {},
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create payment intent: ${response.statusText}`);
      }

      const paymentIntent = await response.json();
      
      return {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        client_secret: paymentIntent.client_secret,
      };
    } catch (error) {
      console.error('Error creating payment intent:', error);
      throw error;
    }
  }

  /**
   * Confirm a payment with card details
   */
  static async confirmPayment(clientSecret: string, cardElement: any): Promise<any> {
    try {
      const stripe = await this.getStripe();
      if (!stripe) {
        throw new Error('Stripe not initialized');
      }

      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      return paymentIntent;
    } catch (error) {
      console.error('Error confirming payment:', error);
      throw error;
    }
  }

  /**
   * Capture a payment intent (convert authorization to charge)
   */
  static async capturePayment(paymentIntentId: string): Promise<any> {
    try {
      const response = await fetch(`/api/stripe/payment-intents/${paymentIntentId}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to capture payment: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error capturing payment:', error);
      throw error;
    }
  }

  /**
   * Cancel a payment intent (void authorization)
   */
  static async cancelPayment(paymentIntentId: string): Promise<any> {
    try {
      const response = await fetch(`/api/stripe/payment-intents/${paymentIntentId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to cancel payment: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error canceling payment:', error);
      throw error;
    }
  }

  /**
   * Create a refund for a captured payment
   */
  static async createRefund(paymentIntentId: string, amount?: number): Promise<any> {
    try {
      const response = await fetch('/api/stripe/refunds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payment_intent: paymentIntentId,
          amount: amount ? Math.round(amount * 100) : undefined, // Convert to cents if specified
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create refund: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating refund:', error);
      throw error;
    }
  }
}

export default StripeService;