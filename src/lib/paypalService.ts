import { supabase } from './supabase';

export interface PayPalOrderData {
  id: string;
  status: string;
  amount: number;
  currency: string;
  payer?: {
    email_address?: string;
    name?: {
      given_name?: string;
      surname?: string;
    };
  };
  purchase_units?: any[];
  links?: any[];
}

export interface PayPalPaymentData {
  orderId: string;
  payerId?: string;
  paymentId?: string;
  authorizationId?: string;
  amount: number;
  currency: string;
  status: 'created' | 'approved' | 'authorized' | 'captured' | 'cancelled' | 'failed';
  payerEmail?: string;
  payerName?: string;
}

export interface PayPalAuthorizationData {
  id: string;
  status: string;
  amount: {
    currency_code: string;
    value: string;
  };
  create_time: string;
  expiration_time: string;
  links?: any[];
}

export class PayPalService {
  private static clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
  private static clientSecret = import.meta.env.PAYPAL_CLIENT_SECRET;
  private static sandboxMode = import.meta.env.VITE_PAYPAL_SANDBOX_MODE !== 'false'; // Production if explicitly set to 'false'

  private static get baseUrl() {
    return this.sandboxMode 
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';
  }

  /**
   * Get PayPal access token for API requests
   */
  private static async getAccessToken(): Promise<string> {
    const auth = btoa(`${this.clientId}:${this.clientSecret}`);
    
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en_US',
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error('Failed to get PayPal access token');
    }

    const data = await response.json();
    return data.access_token;
  }

  /**
   * Create PayPal order for payment
   */
  static async createOrder(amount: number, currency: string = 'CAD', intent: 'CAPTURE' | 'AUTHORIZE' = 'CAPTURE'): Promise<PayPalOrderData> {
    try {
      const accessToken = await this.getAccessToken();

      const orderData = {
        intent,
        purchase_units: [
          {
            amount: {
              currency_code: currency.toUpperCase(),
              value: amount.toFixed(2),
            },
            description: 'OnGoPool Ride Payment',
          },
        ],
        application_context: {
          return_url: `${window.location.origin}/payment/success`,
          cancel_url: `${window.location.origin}/payment/cancel`,
          brand_name: 'OnGoPool',
          locale: 'en-CA',
          landing_page: 'BILLING',
          shipping_preference: 'NO_SHIPPING',
          user_action: intent === 'AUTHORIZE' ? 'CONTINUE' : 'PAY_NOW',
        },
      };

      const response = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create PayPal order');
      }

      const order = await response.json();
      return order;
    } catch (error) {
      console.error('PayPal order creation failed:', error);
      throw error;
    }
  }

  /**
   * Capture PayPal order after approval
   */
  static async captureOrder(orderId: string): Promise<PayPalOrderData> {
    try {
      const accessToken = await this.getAccessToken();

      const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to capture PayPal order');
      }

      const capturedOrder = await response.json();
      return capturedOrder;
    } catch (error) {
      console.error('PayPal order capture failed:', error);
      throw error;
    }
  }

  /**
   * Get PayPal order details
   */
  static async getOrderDetails(orderId: string): Promise<PayPalOrderData> {
    try {
      const accessToken = await this.getAccessToken();

      const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get PayPal order details');
      }

      const order = await response.json();
      return order;
    } catch (error) {
      console.error('Failed to get PayPal order details:', error);
      throw error;
    }
  }

  /**
   * Process PayPal payment and store in database
   */
  static async processPayment(
    orderId: string,
    bookingId: number,
    userId: string,
    amount: number
  ): Promise<PayPalPaymentData> {
    try {
      // Capture the PayPal order
      const capturedOrder = await this.captureOrder(orderId);

      if (capturedOrder.status !== 'COMPLETED') {
        throw new Error('PayPal payment was not completed successfully');
      }

      // Extract payment information
      const paymentData: PayPalPaymentData = {
        orderId: capturedOrder.id,
        paymentId: capturedOrder.purchase_units?.[0]?.payments?.captures?.[0]?.id,
        amount: amount,
        currency: capturedOrder.purchase_units?.[0]?.amount?.currency_code || 'CAD',
        status: 'captured',
        payerEmail: capturedOrder.payer?.email_address,
        payerName: capturedOrder.payer?.name 
          ? `${capturedOrder.payer.name.given_name || ''} ${capturedOrder.payer.name.surname || ''}`.trim()
          : undefined,
      };

      // Store payment record in database
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          booking_id: bookingId,
          user_id: userId,
          amount: amount,
          currency: paymentData.currency.toLowerCase(),
          payment_method: 'paypal',
          payment_intent_id: paymentData.paymentId,
          transaction_id: paymentData.orderId,
          status: 'succeeded',
          payment_data: {
            paypal_order_id: paymentData.orderId,
            paypal_payment_id: paymentData.paymentId,
            payer_email: paymentData.payerEmail,
            payer_name: paymentData.payerName,
          },
        });

      if (paymentError) {
        console.error('Failed to store PayPal payment record:', paymentError);
        throw new Error('Payment succeeded but failed to record transaction');
      }

      return paymentData;
    } catch (error) {
      console.error('PayPal payment processing failed:', error);
      throw error;
    }
  }

  /**
   * Get client configuration for PayPal React SDK
   */
  static getClientConfig() {
    return {
      'client-id': this.clientId,
      currency: 'CAD',
      intent: 'capture',
      'data-client-token': undefined, // Optional: for advanced features
      debug: this.sandboxMode,
    };
  }

  /**
   * Authorize PayPal order after approval
   */
  static async authorizeOrder(orderId: string): Promise<PayPalAuthorizationData> {
    try {
      const accessToken = await this.getAccessToken();

      const response = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}/authorize`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to authorize PayPal order');
      }

      const authorizedOrder = await response.json();
      const authorizationId = authorizedOrder.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;
      
      if (!authorizationId) {
        throw new Error('No authorization ID found in PayPal response');
      }

      return authorizedOrder.purchase_units[0].payments.authorizations[0];
    } catch (error) {
      console.error('PayPal order authorization failed:', error);
      throw error;
    }
  }

  /**
   * Capture an existing PayPal authorization
   */
  static async captureAuthorization(authorizationId: string, amount?: number, currency: string = 'CAD'): Promise<any> {
    try {
      const accessToken = await this.getAccessToken();

      const captureData: any = {};
      if (amount) {
        captureData.amount = {
          currency_code: currency.toUpperCase(),
          value: amount.toFixed(2),
        };
      }

      const response = await fetch(`${this.baseUrl}/v2/payments/authorizations/${authorizationId}/capture`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(captureData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to capture PayPal authorization');
      }

      const capture = await response.json();
      return capture;
    } catch (error) {
      console.error('PayPal authorization capture failed:', error);
      throw error;
    }
  }

  /**
   * Void (cancel) an existing PayPal authorization
   */
  static async voidAuthorization(authorizationId: string): Promise<void> {
    try {
      const accessToken = await this.getAccessToken();

      const response = await fetch(`${this.baseUrl}/v2/payments/authorizations/${authorizationId}/void`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to void PayPal authorization');
      }
    } catch (error) {
      console.error('PayPal authorization void failed:', error);
      throw error;
    }
  }

  /**
   * Create PayPal payment authorization (hold) for ride requests
   */
  static async createPaymentHold(
    amount: number,
    currency: string = 'CAD',
    bookingId: number,
    userId: string
  ): Promise<PayPalPaymentData> {
    try {
      // Create order with AUTHORIZE intent
      const order = await this.createOrder(amount, currency, 'AUTHORIZE');

      // Store initial payment record with pending status
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          booking_id: bookingId,
          user_id: userId,
          amount: amount,
          currency: currency.toLowerCase(),
          payment_method: 'paypal',
          transaction_id: order.id,
          status: 'requires_action', // Pending user approval
          payment_data: {
            paypal_order_id: order.id,
            intent: 'AUTHORIZE',
            created_at: new Date().toISOString(),
          },
        });

      if (paymentError) {
        console.error('Failed to store PayPal payment hold record:', paymentError);
        throw new Error('Failed to create payment hold record');
      }

      return {
        orderId: order.id,
        amount: amount,
        currency: currency,
        status: 'created',
      };
    } catch (error) {
      console.error('PayPal payment hold creation failed:', error);
      throw error;
    }
  }

  /**
   * Process PayPal authorization after user approval
   */
  static async processAuthorization(
    orderId: string,
    bookingId: number,
    userId: string
  ): Promise<PayPalPaymentData> {
    try {
      // Authorize the PayPal order
      const authorization = await this.authorizeOrder(orderId);

      if (authorization.status !== 'CREATED') {
        throw new Error('PayPal authorization was not created successfully');
      }

      // Update payment record with authorization details
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          payment_intent_id: authorization.id,
          status: 'requires_capture',
          payment_data: {
            paypal_order_id: orderId,
            paypal_authorization_id: authorization.id,
            intent: 'AUTHORIZE',
            authorized_at: new Date().toISOString(),
            expires_at: authorization.expiration_time,
          },
        })
        .eq('transaction_id', orderId)
        .eq('booking_id', bookingId);

      if (updateError) {
        console.error('Failed to update PayPal authorization record:', updateError);
        throw new Error('Authorization succeeded but failed to update record');
      }

      return {
        orderId: orderId,
        authorizationId: authorization.id,
        amount: parseFloat(authorization.amount.value),
        currency: authorization.amount.currency_code,
        status: 'authorized',
      };
    } catch (error) {
      console.error('PayPal authorization processing failed:', error);
      throw error;
    }
  }

  /**
   * Capture payment from existing authorization
   */
  static async captureHeldPayment(
    authorizationId: string,
    bookingId: number,
    amount?: number
  ): Promise<PayPalPaymentData> {
    try {
      // Get payment record to determine currency
      const { data: paymentRecord, error: fetchError } = await supabase
        .from('payments')
        .select('currency, amount, payment_data')
        .eq('payment_intent_id', authorizationId)
        .eq('booking_id', bookingId)
        .single();

      if (fetchError || !paymentRecord) {
        throw new Error('Payment authorization record not found');
      }

      const currency = paymentRecord.currency.toUpperCase();
      const captureAmount = amount || paymentRecord.amount;

      // Capture the authorization
      const capture = await this.captureAuthorization(authorizationId, captureAmount, currency);

      if (capture.status !== 'COMPLETED') {
        throw new Error('PayPal capture was not completed successfully');
      }

      // Update payment record with capture details
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'succeeded',
          payment_data: {
            ...paymentRecord.payment_data,
            paypal_capture_id: capture.id,
            captured_at: new Date().toISOString(),
            captured_amount: captureAmount,
          },
        })
        .eq('payment_intent_id', authorizationId)
        .eq('booking_id', bookingId);

      if (updateError) {
        console.error('Failed to update PayPal capture record:', updateError);
        throw new Error('Capture succeeded but failed to update record');
      }

      return {
        orderId: paymentRecord.payment_data.paypal_order_id,
        authorizationId: authorizationId,
        paymentId: capture.id,
        amount: captureAmount,
        currency: currency,
        status: 'captured',
      };
    } catch (error) {
      console.error('PayPal payment capture failed:', error);
      throw error;
    }
  }

  /**
   * Cancel (void) payment authorization
   */
  static async cancelPaymentHold(
    authorizationId: string,
    bookingId: number
  ): Promise<void> {
    try {
      // Void the PayPal authorization
      await this.voidAuthorization(authorizationId);

      // Update payment record to cancelled status
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'cancelled',
          payment_data: {
            voided_at: new Date().toISOString(),
          },
        })
        .eq('payment_intent_id', authorizationId)
        .eq('booking_id', bookingId);

      if (updateError) {
        console.error('Failed to update cancelled PayPal payment record:', updateError);
        throw new Error('Void succeeded but failed to update record');
      }
    } catch (error) {
      console.error('PayPal payment hold cancellation failed:', error);
      throw error;
    }
  }

  /**
   * Get PayPal SDK options for React PayPal JS
   * LIVE PAYMENTS: Automatically configures for sandbox or production based on environment
   */
  static getSDKOptions(intent: 'capture' | 'authorize' = 'capture') {
    const baseOptions = {
      'client-id': this.clientId,
      currency: 'CAD',
      intent: intent,
      components: 'buttons,messages',
      'enable-funding': 'venmo,paylater',
      'disable-funding': 'credit,card',
      'data-sdk-integration-source': 'button-factory',
    };

    // Add environment-specific options
    if (!this.sandboxMode) {
      console.log('✅ PayPal SDK configured for LIVE/PRODUCTION mode');
      console.log('🔗 Payments will be processed through production PayPal API');
    } else {
      console.log('⚠️ PayPal SDK configured for SANDBOX mode');
      console.log('💡 Set VITE_PAYPAL_SANDBOX_MODE=false for live payments');
    }

    return baseOptions;
  }

  /**
   * Check if PayPal is in live/production mode
   */
  static isLiveMode(): boolean {
    return !this.sandboxMode;
  }

  /**
   * Get current PayPal environment info
   */
  static getEnvironmentInfo() {
    return {
      mode: this.sandboxMode ? 'sandbox' : 'production',
      baseUrl: this.baseUrl,
      clientId: this.clientId,
      isLive: !this.sandboxMode
    };
  }
}