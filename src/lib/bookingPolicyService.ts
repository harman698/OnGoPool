import { supabase } from './supabase';
import { PaymentHoldService } from './paymentHoldService';

export interface CancellationResult {
  success: boolean;
  refunded: boolean;
  reason?: string;
  error?: string;
  refundAmount?: number;
  cancellationFee?: number;
}

export interface CancellationEligibility {
  canCancel: boolean;
  reason: string;
  refundAmount?: number;
  cancellationFee?: number;
  timeToRide?: number; // hours until ride departure
}

/**
 * Booking Policy Service
 * Handles cancellation policies, automatic refunds, and no-cancellation enforcement
 */
export class BookingPolicyService {

  /**
   * Check if a booking can be cancelled and calculate refund amount
   */
  static async checkCancellationEligibility(
    bookingId: number, 
    userId: string
  ): Promise<CancellationEligibility> {
    try {
      const { data: booking, error } = await supabase
        .from('ride_bookings')
        .select(`
          *,
          rides (*)
        `)
        .eq('id', bookingId)
        .single();

      if (error || !booking) {
        return {
          canCancel: false,
          reason: 'Booking not found'
        };
      }

      // Check if user is passenger or driver
      const isPassenger = booking.passenger_id === userId;
      const isDriver = booking.rides.driver_id === userId;

      if (!isPassenger && !isDriver) {
        return {
          canCancel: false,
          reason: 'You are not authorized to cancel this booking'
        };
      }

      // Calculate time until departure
      const now = new Date();
      const departureTime = new Date(booking.rides.departure_time);
      const hoursUntilDeparture = (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Check current booking status
      if (booking.status === 'cancelled') {
        return {
          canCancel: false,
          reason: 'Booking is already cancelled'
        };
      }

      if (booking.status === 'rejected') {
        return {
          canCancel: false,
          reason: 'Booking was already rejected'
        };
      }

      // For pending bookings - full refund always allowed
      if (booking.status === 'pending') {
        return {
          canCancel: true,
          reason: 'Pending booking can be cancelled with full refund',
          refundAmount: booking.total_amount,
          cancellationFee: 0,
          timeToRide: hoursUntilDeparture
        };
      }

      // For confirmed bookings - apply cancellation policy based on time
      if (booking.status === 'confirmed') {
        const refundData = this.calculateRefundAmount(booking.total_amount, hoursUntilDeparture);
        
        // Special handling for past rides
        if (hoursUntilDeparture <= -2) {
          return {
            canCancel: false,
            reason: 'Cannot cancel completed rides'
          };
        }

        return {
          canCancel: true,
          reason: this.getCancellationPolicyMessage(hoursUntilDeparture),
          refundAmount: refundData.refundAmount,
          cancellationFee: refundData.cancellationFee,
          timeToRide: hoursUntilDeparture
        };
      }

      return {
        canCancel: false,
        reason: 'Booking cannot be cancelled at this time'
      };

    } catch (error) {
      console.error('Error checking cancellation eligibility:', error);
      return {
        canCancel: false,
        reason: 'Error checking cancellation eligibility'
      };
    }
  }

  /**
   * Calculate refund amount based on cancellation policy
   */
  private static calculateRefundAmount(totalAmount: number, hoursUntilDeparture: number): {
    refundAmount: number;
    cancellationFee: number;
  } {
    let refundPercentage: number;

    if (hoursUntilDeparture >= 12) {
      // 12+ hours before departure: No cancellation fee
      refundPercentage = 100;
    } else if (hoursUntilDeparture >= 6) {
      // 6-12 hours before departure: 25% cancellation fee
      refundPercentage = 75;
    } else if (hoursUntilDeparture >= 2) {
      // 2-6 hours before departure: 50% cancellation fee
      refundPercentage = 50;
    } else if (hoursUntilDeparture >= 0) {
      // Less than 2 hours before departure: 75% cancellation fee
      refundPercentage = 25;
    } else {
      // After departure time (no-show): 100% cancellation fee
      refundPercentage = 0;
    }

    const refundAmount = Math.round((totalAmount * refundPercentage / 100) * 100) / 100;
    const cancellationFee = Math.round((totalAmount - refundAmount) * 100) / 100;

    return { refundAmount, cancellationFee };
  }

  /**
   * Get user-friendly cancellation policy message
   */
  private static getCancellationPolicyMessage(hoursUntilDeparture: number): string {
    if (hoursUntilDeparture >= 12) {
      return 'Free cancellation - No cancellation fee (12+ hours before departure)';
    } else if (hoursUntilDeparture >= 6) {
      return 'Cancellation fee: 25% of ride cost (6-12 hours before departure)';
    } else if (hoursUntilDeparture >= 2) {
      return 'Cancellation fee: 50% of ride cost (2-6 hours before departure)';
    } else if (hoursUntilDeparture >= 0) {
      return 'Cancellation fee: 75% of ride cost (less than 2 hours before departure)';
    } else {
      return 'No refund available for completed rides';
    }
  }

  /**
   * Cancel a booking with automatic refund processing
   */
  static async cancelBooking(bookingId: number, userId: string): Promise<CancellationResult> {
    try {
      // First check if cancellation is allowed
      const eligibility = await this.checkCancellationEligibility(bookingId, userId);
      
      if (!eligibility.canCancel) {
        return {
          success: false,
          refunded: false,
          error: eligibility.reason
        };
      }

      // Get booking details for processing
      const { data: booking, error: bookingError } = await supabase
        .from('ride_bookings')
        .select(`
          *,
          rides (*)
        `)
        .eq('id', bookingId)
        .single();

      if (bookingError || !booking) {
        return {
          success: false,
          refunded: false,
          error: 'Booking not found'
        };
      }

      // Process refund based on status and time
      let refundResult = null;
      if (booking.status === 'pending') {
        // Full refund for pending bookings
        refundResult = await PaymentHoldService.refundPaymentHold(
          bookingId, 
          'passenger_cancelled'
        );
      } else if (booking.status === 'confirmed' && eligibility.refundAmount! > 0) {
        // Partial refund for confirmed bookings based on policy
        refundResult = await this.processPartialRefund(
          bookingId, 
          eligibility.refundAmount!,
          eligibility.cancellationFee!
        );
      }

      // Update booking status
      const { error: updateError } = await supabase
        .from('ride_bookings')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (updateError) {
        console.error('Error updating booking status:', updateError);
        return {
          success: false,
          refunded: false,
          error: 'Failed to update booking status'
        };
      }

      // Send cancellation message to chat
      await this.sendCancellationMessage(
        bookingId, 
        booking.ride_id, 
        userId, 
        'passenger_cancelled',
        eligibility.refundAmount,
        eligibility.cancellationFee
      );

      return {
        success: true,
        refunded: (eligibility.refundAmount! > 0),
        refundAmount: eligibility.refundAmount,
        cancellationFee: eligibility.cancellationFee,
        reason: 'Booking cancelled successfully'
      };

    } catch (error) {
      console.error('Error cancelling booking:', error);
      return {
        success: false,
        refunded: false,
        error: 'An error occurred while cancelling the booking'
      };
    }
  }

  /**
   * Process partial refund for confirmed bookings
   */
  private static async processPartialRefund(
    bookingId: number,
    refundAmount: number,
    cancellationFee: number
  ): Promise<any> {
    try {
      // Create payment record for the partial refund
      const { data: booking } = await supabase
        .from('ride_bookings')
        .select('passenger_id, total_amount')
        .eq('id', bookingId)
        .single();

      if (!booking) return null;

      // Insert refund payment record
      const { data: payment, error } = await supabase
        .from('payments')
        .insert({
          booking_id: bookingId,
          user_id: booking.passenger_id,
          amount: -refundAmount, // Negative amount for refund
          currency: 'USD',
          status: 'refunded',
          payment_method: 'refund',
          refund_reason: 'passenger_cancelled_with_fee',
          refunded_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating refund payment record:', error);
      }

      // Create cancellation fee record if applicable
      if (cancellationFee > 0) {
        await supabase
          .from('payments')
          .insert({
            booking_id: bookingId,
            user_id: booking.passenger_id,
            amount: cancellationFee,
            currency: 'USD',
            status: 'captured',
            payment_method: 'cancellation_fee',
            created_at: new Date().toISOString()
          });
      }

      return payment;
    } catch (error) {
      console.error('Error processing partial refund:', error);
      return null;
    }
  }

  /**
   * Request cancellation exception for edge cases
   */
  static async requestCancellationException(
    bookingId: number, 
    userId: string, 
    justification: string
  ): Promise<{ success: boolean; ticketId?: number; error?: string }> {
    try {
      const { data: ticket, error } = await supabase
        .from('support_tickets')
        .insert({
          user_id: userId,
          subject: `Cancellation Exception Request - Booking #${bookingId}`,
          description: `User is requesting an exception to cancel confirmed booking #${bookingId}.\n\nJustification: ${justification}`,
          category: 'cancellation_exception',
          priority: 'medium',
          status: 'open'
        })
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        ticketId: ticket.id
      };
    } catch (error) {
      console.error('Error creating cancellation exception request:', error);
      return {
        success: false,
        error: 'Failed to submit cancellation exception request'
      };
    }
  }

  /**
   * Grant cancellation exception (admin function)
   */
  static async grantCancellationException(bookingId: number): Promise<CancellationResult> {
    try {
      // Set special flag to allow cancellation
      const { error: updateError } = await supabase
        .from('ride_bookings')
        .update({ can_cancel_after_confirm: true })
        .eq('id', bookingId);

      if (updateError) throw updateError;

      return {
        success: true,
        refunded: false,
        reason: 'Cancellation exception granted. Booking can now be cancelled.'
      };
    } catch (error) {
      console.error('Error granting cancellation exception:', error);
      return {
        success: false,
        refunded: false,
        error: 'Failed to grant cancellation exception'
      };
    }
  }

  /**
   * Send cancellation message to chat
   */
  private static async sendCancellationMessage(
    bookingId: number, 
    rideId: number, 
    userId: string, 
    reason: string,
    refundAmount?: number,
    cancellationFee?: number
  ): Promise<void> {
    try {
      let messageText = '';
      
      switch (reason) {
        case 'passenger_cancelled':
          if (refundAmount && refundAmount > 0) {
            if (cancellationFee && cancellationFee > 0) {
              messageText = `Passenger cancelled the booking. Refund of $${refundAmount.toFixed(2)} will be processed (cancellation fee: $${cancellationFee.toFixed(2)}).`;
            } else {
              messageText = `Passenger cancelled the booking. Full refund of $${refundAmount.toFixed(2)} will be processed.`;
            }
          } else {
            messageText = 'Passenger cancelled the booking. No refund applicable.';
          }
          break;
        case 'driver_cancelled':
          messageText = 'Driver cancelled the ride. Full refund will be processed automatically.';
          break;
        case 'timeout':
          messageText = 'Booking expired due to no driver response. Full refund processed automatically.';
          break;
        default:
          messageText = 'Booking has been cancelled.';
      }

      await supabase
        .from('messages')
        .insert({
          booking_id: bookingId,
          sender_id: userId,
          message: messageText,
          is_system_message: true
        });

    } catch (error) {
      console.error('Error sending cancellation message:', error);
    }
  }

  /**
   * Check if ride is completed (for determining if cancellation is still possible)
   */
  static async isRideCompleted(rideId: number): Promise<boolean> {
    try {
      const { data: ride } = await supabase
        .from('rides')
        .select('status, departure_time, arrival_time')
        .eq('id', rideId)
        .single();

      if (!ride) return false;

      // Check if ride is marked as completed
      if (ride.status === 'completed') return true;

      // Check if enough time has passed since departure
      const now = new Date();
      const departureTime = new Date(ride.departure_time);
      const hoursPassedSinceDeparture = (now.getTime() - departureTime.getTime()) / (1000 * 60 * 60);

      // Consider ride completed if more than 6 hours have passed since departure
      // (assuming most rides don't take longer than 6 hours)
      return hoursPassedSinceDeparture > 6;

    } catch (error) {
      console.error('Error checking ride completion:', error);
      return false;
    }
  }

  /**
   * Process automatic refunds based on cancellation policies
   * Called by scheduled jobs or triggered events
   */
  static async processAutomaticRefunds(): Promise<void> {
    try {
      // Find all pending bookings that have expired
      const { data: expiredBookings } = await supabase
        .from('ride_bookings')
        .select(`
          *,
          rides (departure_time, driver_id)
        `)
        .eq('status', 'pending')
        .lt('response_deadline', new Date().toISOString());

      for (const booking of expiredBookings || []) {
        await PaymentHoldService.refundPaymentHold(booking.id, 'timeout');
      }

      console.log(`Processed ${expiredBookings?.length || 0} expired booking refunds`);
    } catch (error) {
      console.error('Error processing automatic refunds:', error);
    }
  }
}