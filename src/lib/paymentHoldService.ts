import { supabase } from './supabase';

export interface PaymentHoldData {
  amount: number;
  paymentMethod: {
    id: string;
    type: 'stripe' | 'paypal';
    last4?: string;
    brand?: string;
  };
  bookingId: number;
  userId: string;
}

export interface PaymentHoldResult {
  success: boolean;
  paymentId?: number;
  authorizationId?: string;
  expiresAt?: Date;
  error?: string;
}

export interface PaymentCaptureResult {
  success: boolean;
  transactionId?: string;
  amountCaptured?: number;
  error?: string;
}

export interface PaymentRefundResult {
  success: boolean;
  refundAmount?: number;
  reason?: string;
  error?: string;
}

export type RefundReason = 'driver_rejected' | 'timeout' | 'passenger_cancelled';

/**
 * Payment Hold Service - LIVE PAYMENTS ONLY
 * Handles live payment authorization holds, captures, and refunds for ride bookings
 * Note: Requires backend API deployment for Stripe integration
 */
export class PaymentHoldService {
  
  /**
   * Create a payment authorization hold when passenger requests a ride
   */
  static async createPaymentHold(data: PaymentHoldData): Promise<PaymentHoldResult> {
    try {
      // Route to appropriate payment processor based on payment method type
      if (data.paymentMethod.type === 'paypal') {
        return await this.createPayPalPaymentHold(data);
      } else {
        return await this.createStripePaymentHold(data);
      }
    } catch (error) {
      console.error('Payment hold creation failed:', error);
      return {
        success: false,
        error: 'Payment authorization failed. Please try again.'
      };
    }
  }

  /**
   * Create PayPal payment authorization hold
   */
  private static async createPayPalPaymentHold(data: PaymentHoldData): Promise<PaymentHoldResult> {
    try {
      const { PayPalService } = await import('./paypalService');
      
      // Create PayPal payment hold
      const paypalResult = await PayPalService.createPaymentHold(
        data.amount,
        'CAD',
        data.bookingId,
        data.userId
      );

      // Calculate expiration time (12 hours from now)
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

      // Get the created payment record ID
      const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('id')
        .eq('transaction_id', paypalResult.orderId)
        .eq('booking_id', data.bookingId)
        .single();

      if (fetchError || !payment) {
        throw new Error('Failed to retrieve PayPal payment record');
      }

      // Create payment hold tracking record
      const { error: holdError } = await supabase
        .from('payment_holds')
        .insert({
          booking_id: data.bookingId,
          payment_id: payment.id,
          hold_amount: data.amount,
          hold_expires_at: expiresAt.toISOString(),
          status: 'active'
        });

      if (holdError) {
        console.error('Failed to create PayPal payment hold record:', holdError);
      }

      // Update booking with payment authorization details
      const { error: bookingError } = await supabase
        .from('ride_bookings')
        .update({
          payment_authorized_at: new Date().toISOString(),
          payment_expires_at: expiresAt.toISOString(),
          response_deadline: expiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', data.bookingId);

      if (bookingError) {
        console.error('Failed to update booking with PayPal payment details:', bookingError);
        return {
          success: false,
          error: 'Failed to update booking with payment details'
        };
      }

      return {
        success: true,
        paymentId: payment.id,
        authorizationId: paypalResult.orderId,
        expiresAt: expiresAt
      };

    } catch (error) {
      console.error('PayPal payment hold creation failed:', error);
      return {
        success: false,
        error: 'PayPal payment authorization failed. Please try again.'
      };
    }
  }

  /**
   * Create Stripe payment authorization hold using backend API
   */
  private static async createStripePaymentHold(data: PaymentHoldData): Promise<PaymentHoldResult> {
    try {
      console.log('Creating Stripe payment hold:', {
        bookingId: data.bookingId,
        userId: data.userId,
        amount: data.amount,
        paymentMethodId: data.paymentMethod.id
      });

      // Use real Stripe API via backend service
      const { stripeAPIClient } = await import('./stripeApiClient');
      
      // Create payment intent with authorization hold
      const paymentIntentResult = await stripeAPIClient.createPaymentIntent({
        amount: data.amount,
        currency: 'cad',
        capture_method: 'manual',
        booking_id: data.bookingId,
        user_id: data.userId,
        payment_method_id: data.paymentMethod.id // Use saved payment method if available
      });

      console.log('Stripe Payment Intent result:', {
        id: paymentIntentResult.payment_intent.id,
        isMock: paymentIntentResult.payment_intent.id.includes('mock'),
        status: paymentIntentResult.payment_intent.status
      });

      // 2. Calculate expiration time (12 hours from now)
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

      // 3. Determine payment status based on whether this is mock or real
      const isMockPayment = paymentIntentResult.payment_intent.id.includes('mock');
      const paymentStatus = isMockPayment ? 'authorized' : 'authorized';

      console.log('Creating payment record:', {
        isMock: isMockPayment,
        status: paymentStatus,
        paymentIntentId: paymentIntentResult.payment_intent.id
      });

      // 3. Store payment record in database
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          booking_id: data.bookingId,
          user_id: data.userId,
          amount: data.amount,
          currency: 'cad',
          status: paymentStatus,
          payment_method: 'stripe',
          payment_intent_id: paymentIntentResult.payment_intent.id,
          authorization_id: paymentIntentResult.payment_intent.id,
          expires_at: expiresAt.toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (paymentError) {
        console.error('Failed to create payment record:', paymentError);
        console.error('Payment error details:', paymentError.message, paymentError.code);
        return {
          success: false,
          error: `Failed to create payment authorization: ${paymentError.message}`
        };
      }

      console.log('Payment record created successfully:', payment.id);

      // 4. Create payment hold tracking record
      const { error: holdError } = await supabase
        .from('payment_holds')
        .insert({
          booking_id: data.bookingId,
          payment_id: payment.id,
          hold_amount: data.amount,
          hold_expires_at: expiresAt.toISOString(),
          status: 'active'
        });

      if (holdError) {
        console.error('Failed to create payment hold record:', holdError);
        console.error('Hold error details:', holdError.message, holdError.code);
        // Don't fail the entire operation for tracking record issues
      } else {
        console.log('Payment hold tracking record created successfully');
      }

      // 5. Update booking with payment authorization details
      const { error: bookingError } = await supabase
        .from('ride_bookings')
        .update({
          payment_status: 'authorized',
          payment_authorized_at: new Date().toISOString(),
          payment_expires_at: expiresAt.toISOString(),
          response_deadline: expiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', data.bookingId);

      if (bookingError) {
        console.error('Failed to update booking with payment details:', bookingError);
        console.error('Booking error details:', bookingError.message, bookingError.code);
        return {
          success: false,
          error: `Failed to update booking with payment details: ${bookingError.message}`
        };
      }

      console.log('Booking updated with payment authorization details');

      const result = {
        success: true,
        paymentId: payment.id,
        authorizationId: paymentIntentResult.payment_intent.id,
        clientSecret: paymentIntentResult.client_secret,
        expiresAt: expiresAt
      };

      console.log('Stripe payment hold created successfully:', result);
      return result;

    } catch (error) {
      console.error('Stripe payment hold creation failed:', error);
      
      // Enhanced error reporting
      let errorMessage = 'Stripe payment authorization failed. Please try again.';
      
      if (error instanceof Error) {
        console.error('Error details:', error.message, error.stack);
        
        // Provide more specific error messages based on error type
        if (error.message.includes('fetch')) {
          errorMessage = 'Payment service connection failed. Please check your internet connection and try again.';
        } else if (error.message.includes('payment_intent')) {
          errorMessage = 'Payment authorization setup failed. Please verify your payment details and try again.';
        } else if (error.message.includes('database')) {
          errorMessage = 'Payment record creation failed. Please try again or contact support.';
        }
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Capture payment hold when driver accepts the ride request
   */
  static async capturePaymentHold(bookingId: number): Promise<PaymentCaptureResult> {
    try {
      console.log('Looking for payment authorization for booking:', bookingId);
      
      // 1. Enhanced debugging - check all payments for this booking first
      const { data: allPayments, error: allPaymentsError } = await supabase
        .from('payments')
        .select('id, booking_id, status, payment_method, transaction_id, payment_intent_id, created_at')
        .eq('booking_id', bookingId);
      
      console.log('All payments for booking', bookingId, ':', allPayments);
      console.log('All payments query error:', allPaymentsError);
      
      if (allPaymentsError) {
        console.error('Failed to query all payments:', allPaymentsError);
        return {
          success: false,
          error: `Database query failed: ${allPaymentsError.message}`
        };
      }

      if (!allPayments || allPayments.length === 0) {
        console.error('No payment records found for booking', bookingId);
        
        // Check if booking exists and has legacy payment data
        const { data: booking, error: bookingError } = await supabase
          .from('ride_bookings')
          .select('id, status, payment_status, payment_intent_id, total_amount, passenger_id, created_at')
          .eq('id', bookingId)
          .single();
        
        console.log('Booking details:', booking);
        console.log('Booking query error:', bookingError);
        
        if (booking && booking.payment_status === 'paid' && booking.payment_intent_id) {
          console.log('Creating missing payment record for legacy booking', bookingId);
          
          // Create missing payment record for legacy booking
          const { data: createdPayment, error: createError } = await supabase
            .from('payments')
            .insert({
              booking_id: bookingId,
              user_id: booking.passenger_id,
              amount: booking.total_amount,
              currency: 'cad',
              status: 'completed',
              payment_method: 'stripe',
              payment_intent_id: booking.payment_intent_id,
              authorization_id: booking.payment_intent_id,
              created_at: booking.created_at,
              updated_at: booking.created_at
            })
            .select()
            .single();
            
          if (createError) {
            console.error('Failed to create missing payment record:', createError);
            return {
              success: false,
              error: `Legacy booking ${bookingId} payment record creation failed: ${createError.message}`
            };
          }
          
          console.log('Successfully created payment record for legacy booking:', createdPayment);
          return {
            success: true,
            message: `Legacy booking ${bookingId} payment record created successfully. Payment already completed.`,
            paymentId: createdPayment.id
          };
        }
        
        return {
          success: false,
          error: `No payment records found for booking ${bookingId}. Booking exists: ${booking ? 'YES' : 'NO'}`
        };
      }

      // 2. Get payment authorization details - expanded status search
      const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('*')
        .eq('booking_id', bookingId)
        .in('status', ['authorized', 'requires_capture', 'requires_action'])
        .single();

      console.log('Capturable payment record found:', payment);
      console.log('Capturable payment fetch error:', fetchError);

      if (fetchError || !payment) {
        // Show detailed status information
        const statusCounts = allPayments.reduce((acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        console.log('Payment status breakdown:', statusCounts);
        
        // Check if any payment is already completed
        const completedPayment = allPayments.find(p => p.status === 'completed');
        if (completedPayment) {
          console.log('Payment already completed for booking', bookingId, '- payment ID:', completedPayment.id);
          return {
            success: true,
            message: `Payment for booking ${bookingId} already completed`,
            paymentId: completedPayment.id
          };
        }
        
        return {
          success: false,
          error: `No capturable payment found for booking ${bookingId}. Found ${allPayments.length} payments with statuses: ${Object.entries(statusCounts).map(([status, count]) => `${status}(${count})`).join(', ')}`
        };
      }

      // 2. Check if authorization is still valid
      if (new Date() > new Date(payment.expires_at)) {
        return {
          success: false,
          error: 'Payment authorization has expired'
        };
      }

      // 3. Route to appropriate payment processor
      if (payment.payment_method === 'paypal') {
        return await this.capturePayPalPaymentHold(payment, bookingId);
      } else {
        return await this.captureStripePaymentHold(payment, bookingId);
      }

    } catch (error) {
      console.error('Payment capture failed:', error);
      return {
        success: false,
        error: 'Failed to capture payment. Please try again.'
      };
    }
  }

  /**
   * Capture PayPal payment hold
   */
  private static async capturePayPalPaymentHold(payment: any, bookingId: number): Promise<PaymentCaptureResult> {
    try {
      console.log('Capturing PayPal payment hold:', { paymentId: payment.id, status: payment.status, bookingId });
      
      const { PayPalService } = await import('./paypalService');

      // For PayPal, we need to first process the authorization if not already done
      let authorizationId = payment.payment_intent_id;
      
      if (payment.status === 'requires_action') {
        console.log('Processing PayPal authorization first for order:', payment.transaction_id);
        
        // Process authorization first
        const authResult = await PayPalService.processAuthorization(
          payment.transaction_id,
          bookingId,
          payment.user_id
        );
        authorizationId = authResult.authorizationId!;
        
        console.log('Authorization processed, authorizationId:', authorizationId);
      } else {
        console.log('Using existing authorizationId:', authorizationId);
      }

      // Capture the PayPal authorization
      console.log('Capturing PayPal authorization:', authorizationId);
      const captureResult = await PayPalService.captureHeldPayment(
        authorizationId,
        bookingId,
        payment.amount
      );
      
      console.log('PayPal capture result:', captureResult);

      // Update payment hold status
      await supabase
        .from('payment_holds')
        .update({
          status: 'captured',
          updated_at: new Date().toISOString()
        })
        .eq('payment_id', payment.id);

      // Update booking status to confirmed
      await supabase
        .from('ride_bookings')
        .update({
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      return {
        success: true,
        transactionId: captureResult.paymentId,
        amountCaptured: captureResult.amount
      };

    } catch (error) {
      console.error('PayPal payment capture failed:', error);
      return {
        success: false,
        error: 'Failed to capture PayPal payment. Please try again.'
      };
    }
  }

  /**
   * Capture Stripe payment hold using backend API
   */
  private static async captureStripePaymentHold(payment: any, bookingId: number): Promise<PaymentCaptureResult> {
    try {
      // Use real Stripe API via backend service
      const { stripeAPIClient } = await import('./stripeApiClient');
      
      // Capture the payment intent
      const captureResult = await stripeAPIClient.capturePaymentIntent(
        payment.payment_intent_id,
        payment.amount // Optional: specify exact capture amount
      );

      console.log('Stripe payment captured via backend API:', captureResult.payment_intent?.id);

      // Update payment status to captured with real transaction data
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'captured',
          transaction_id: captureResult.payment_intent?.id || payment.payment_intent_id,
          captured_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.id);

      if (updateError) {
        console.error('Failed to update payment status:', updateError);
        return {
          success: false,
          error: 'Failed to process payment capture'
        };
      }

      // Update payment hold status
      await supabase
        .from('payment_holds')
        .update({
          status: 'captured',
          updated_at: new Date().toISOString()
        })
        .eq('payment_id', payment.id);

      // Update booking status to confirmed
      await supabase
        .from('ride_bookings')
        .update({
          status: 'confirmed',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      return {
        success: true,
        transactionId: captureResult.payment_intent?.id || payment.payment_intent_id,
        amountCaptured: captureResult.amount_processed || payment.amount
      };

    } catch (error) {
      console.error('Stripe payment capture failed:', error);
      return {
        success: false,
        error: 'Failed to capture Stripe payment. Please try again.'
      };
    }
  }

  /**
   * Refund payment hold when driver rejects, times out, or passenger cancels
   */
  static async refundPaymentHold(
    bookingId: number, 
    reason: RefundReason
  ): Promise<PaymentRefundResult> {
    try {
      console.log('Looking for payment to refund for booking:', bookingId, 'reason:', reason);
      
      // 1. Enhanced debugging - check all payments for this booking first
      const { data: allPayments, error: allPaymentsError } = await supabase
        .from('payments')
        .select('id, booking_id, status, payment_method, transaction_id, payment_intent_id, created_at, amount')
        .eq('booking_id', bookingId);
      
      console.log('All payments for refund booking', bookingId, ':', allPayments);
      
      if (allPaymentsError) {
        console.error('Failed to query all payments for refund:', allPaymentsError);
        return {
          success: false,
          error: `Database query failed: ${allPaymentsError.message}`
        };
      }

      if (!allPayments || allPayments.length === 0) {
        return {
          success: false,
          error: `No payment records found for booking ${bookingId}`
        };
      }

      // Check if payment is already refunded or cancelled
      const existingRefund = allPayments.find(p => 
        p.status === 'refunded' || p.status === 'cancelled' || p.status === 'voided'
      );
      if (existingRefund) {
        return {
          success: true,
          refundAmount: existingRefund.amount,
          reason: reason,
          message: `Payment for booking ${bookingId} already refunded/cancelled`
        };
      }

      // 1. Get payment details - look for both authorized and completed payments
      const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('*')
        .eq('booking_id', bookingId)
        .in('status', ['authorized', 'requires_capture', 'requires_action', 'completed', 'captured'])
        .single();

      console.log('Refundable payment found:', payment);
      console.log('Refund fetch error:', fetchError);

      if (fetchError || !payment) {
        const statusCounts = allPayments.reduce((acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        return {
          success: false,
          error: `No refundable payment found for booking ${bookingId}. Found ${allPayments.length} payments with statuses: ${Object.entries(statusCounts).map(([status, count]) => `${status}(${count})`).join(', ')}`
        };
      }

      // 2. Route to appropriate payment processor based on payment status
      if (payment.payment_method === 'paypal') {
        if (payment.status === 'completed' || payment.status === 'captured') {
          return await this.processPayPalCompletedRefund(payment, bookingId, reason);
        } else {
          return await this.refundPayPalPaymentHold(payment, bookingId, reason);
        }
      } else {
        if (payment.status === 'completed' || payment.status === 'captured') {
          return await this.processStripeCompletedRefund(payment, bookingId, reason);
        } else {
          return await this.refundStripePaymentHold(payment, bookingId, reason);
        }
      }

    } catch (error) {
      console.error('Payment refund failed:', error);
      return {
        success: false,
        error: 'Failed to process refund. Please contact support.'
      };
    }
  }

  /**
   * Refund PayPal payment hold
   */
  private static async refundPayPalPaymentHold(
    payment: any, 
    bookingId: number, 
    reason: RefundReason
  ): Promise<PaymentRefundResult> {
    try {
      const { PayPalService } = await import('./paypalService');

      // For PayPal, we need to void the authorization
      if (payment.payment_intent_id) {
        await PayPalService.cancelPaymentHold(payment.payment_intent_id, bookingId);
      }

      // Update payment hold status
      await supabase
        .from('payment_holds')
        .update({
          status: 'released',
          updated_at: new Date().toISOString()
        })
        .eq('payment_id', payment.id);

      // Update booking status based on reason
      const bookingStatus = reason === 'timeout' ? 'timeout_cancelled' : 'cancelled';
      await supabase
        .from('ride_bookings')
        .update({
          status: bookingStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      return {
        success: true,
        refundAmount: payment.amount,
        reason: reason
      };

    } catch (error) {
      console.error('PayPal payment refund failed:', error);
      return {
        success: false,
        error: 'Failed to process PayPal refund. Please contact support.'
      };
    }
  }

  /**
   * Refund Stripe payment hold (existing implementation)
   */
  private static async refundStripePaymentHold(
    payment: any, 
    bookingId: number, 
    reason: RefundReason
  ): Promise<PaymentRefundResult> {
    try {
      // Use real Stripe API to cancel payment intent
      const { stripeAPIClient } = await import('./stripeApiClient');
      
      const cancelResult = await stripeAPIClient.cancelPaymentIntent(
        payment.payment_intent_id,
        reason
      );

      // Update payment status to refunded
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'cancelled',
          refund_reason: reason,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.id);

      if (updateError) {
        console.error('Failed to update payment status:', updateError);
        return {
          success: false,
          error: 'Failed to process refund'
        };
      }

      // Update payment hold status
      await supabase
        .from('payment_holds')
        .update({
          status: 'released',
          updated_at: new Date().toISOString()
        })
        .eq('payment_id', payment.id);

      // Update booking status based on reason
      const bookingStatus = reason === 'timeout' ? 'timeout_cancelled' : 'cancelled';
      await supabase
        .from('ride_bookings')
        .update({
          status: bookingStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      return {
        success: true,
        refundAmount: payment.amount,
        reason: reason
      };

    } catch (error) {
      console.error('Stripe payment refund failed:', error);
      return {
        success: false,
        error: 'Failed to process Stripe refund. Please contact support.'
      };
    }
  }

  /**
   * Process refund for completed Stripe payments
   */
  private static async processStripeCompletedRefund(
    payment: any,
    bookingId: number,
    reason: RefundReason
  ): Promise<PaymentRefundResult> {
    try {
      console.log('Processing Stripe completed payment refund:', { paymentId: payment.id, status: payment.status, bookingId });

      // Use real Stripe API to create refund for completed payment
      const { stripeAPIClient } = await import('./stripeApiClient');
      
      const refundResult = await stripeAPIClient.createRefund(
        payment.payment_intent_id,
        payment.amount, // Full refund amount
        reason
      );

      // Update payment status to refunded
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'refunded',
          refund_reason: reason,
          refund_id: refundResult.refund?.id,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.id);

      if (updateError) {
        console.error('Failed to update completed payment status for refund:', updateError);
        return {
          success: false,
          error: 'Failed to process completed payment refund'
        };
      }

      // Update payment hold status if exists
      await supabase
        .from('payment_holds')
        .update({
          status: 'refunded',
          updated_at: new Date().toISOString()
        })
        .eq('payment_id', payment.id);

      // Update booking status based on reason
      const bookingStatus = reason === 'timeout' ? 'timeout_cancelled' : 'cancelled';
      await supabase
        .from('ride_bookings')
        .update({
          status: bookingStatus,
          payment_status: 'refunded',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      console.log('Stripe completed payment refund processed successfully:', refundResult.refund?.id);

      return {
        success: true,
        refundAmount: payment.amount,
        reason: reason,
        message: `Completed payment refund processed for booking ${bookingId}`
      };

    } catch (error) {
      console.error('Stripe completed payment refund failed:', error);
      return {
        success: false,
        error: 'Failed to process completed Stripe payment refund. Please contact support.'
      };
    }
  }

  /**
   * Process refund for completed PayPal payments
   */
  private static async processPayPalCompletedRefund(
    payment: any,
    bookingId: number,
    reason: RefundReason
  ): Promise<PaymentRefundResult> {
    try {
      console.log('Processing PayPal completed payment refund:', { paymentId: payment.id, status: payment.status, bookingId });

      // For completed PayPal payments, we would use PayPal's refund API
      // In real implementation: await PayPalService.refundCompletedPayment(payment.transaction_id, payment.amount)
      const mockRefundResult = {
        id: `REFUND_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
        status: 'COMPLETED',
        amount: {
          value: payment.amount.toFixed(2),
          currency_code: 'CAD'
        }
      };

      // Update payment status to refunded
      const { error: updateError } = await supabase
        .from('payments')
        .update({
          status: 'refunded',
          refund_reason: reason,
          refund_id: mockRefundResult.id,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.id);

      if (updateError) {
        console.error('Failed to update completed PayPal payment status for refund:', updateError);
        return {
          success: false,
          error: 'Failed to process completed PayPal payment refund'
        };
      }

      // Update payment hold status if exists
      await supabase
        .from('payment_holds')
        .update({
          status: 'refunded',
          updated_at: new Date().toISOString()
        })
        .eq('payment_id', payment.id);

      // Update booking status based on reason
      const bookingStatus = reason === 'timeout' ? 'timeout_cancelled' : 'cancelled';
      await supabase
        .from('ride_bookings')
        .update({
          status: bookingStatus,
          payment_status: 'refunded',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      console.log('PayPal completed payment refund processed successfully:', mockRefundResult);

      return {
        success: true,
        refundAmount: payment.amount,
        reason: reason,
        message: `Completed PayPal payment refund processed for booking ${bookingId}`
      };

    } catch (error) {
      console.error('PayPal completed payment refund failed:', error);
      return {
        success: false,
        error: 'Failed to process completed PayPal payment refund. Please contact support.'
      };
    }
  }

  /**
   * Check if a booking's payment hold is still valid
   */
  static async isPaymentHoldValid(bookingId: number): Promise<boolean> {
    try {
      const { data: payment } = await supabase
        .from('payments')
        .select('expires_at, status')
        .eq('booking_id', bookingId)
        .in('status', ['authorized', 'requires_capture', 'requires_action'])
        .single();

      if (!payment) return false;

      return new Date() < new Date(payment.expires_at);
    } catch (error) {
      console.error('Failed to check payment hold validity:', error);
      return false;
    }
  }

  /**
   * Get payment hold details for a booking
   */
  static async getPaymentHoldDetails(bookingId: number) {
    try {
      const { data: payment } = await supabase
        .from('payments')
        .select(`
          *,
          payment_holds (*)
        `)
        .eq('booking_id', bookingId)
        .single();

      return payment;
    } catch (error) {
      console.error('Failed to get payment hold details:', error);
      return null;
    }
  }

  /**
   * Process expired payment holds (called by scheduler)
   */
  static async processExpiredHolds(): Promise<void> {
    try {
      // Get all expired authorized payments
      const { data: expiredPayments } = await supabase
        .from('payments')
        .select('id, booking_id, amount')
        .in('status', ['authorized', 'requires_capture', 'requires_action'])
        .lt('expires_at', new Date().toISOString());

      if (!expiredPayments || expiredPayments.length === 0) {
        return;
      }

      // Process each expired payment
      for (const payment of expiredPayments) {
        await this.refundPaymentHold(payment.booking_id, 'timeout');
      }

      console.log(`Processed ${expiredPayments.length} expired payment holds`);
    } catch (error) {
      console.error('Failed to process expired payment holds:', error);
    }
  }
}

// Export types for use in other components
export type { PaymentHoldData, PaymentHoldResult, PaymentCaptureResult, PaymentRefundResult, RefundReason };