import { supabase } from './supabase';
import { PaymentHoldService } from './paymentHoldService';

/**
 * Booking Timeout Service
 * Handles automatic timeout processing for pending ride bookings
 */
export class BookingTimeoutService {
  private static intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the timeout scheduler (runs every 5 minutes)
   */
  static start(): void {
    if (this.intervalId) {
      console.warn('Booking timeout scheduler is already running');
      return;
    }

    console.log('Starting booking timeout scheduler...');
    this.intervalId = setInterval(async () => {
      await this.processTimeouts();
    }, 5 * 60 * 1000); // Run every 5 minutes

    // Run immediately on start
    this.processTimeouts();
  }

  /**
   * Stop the timeout scheduler
   */
  static stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Booking timeout scheduler stopped');
    }
  }

  /**
   * Schedule timeout for a specific booking (12 hours from now)
   */
  static async scheduleBookingTimeout(bookingId: number, timeoutHours: number = 12): Promise<void> {
    try {
      const responseDeadline = new Date(Date.now() + timeoutHours * 60 * 60 * 1000);

      await supabase
        .from('ride_bookings')
        .update({
          response_deadline: responseDeadline.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      console.log(`Scheduled timeout for booking ${bookingId} at ${responseDeadline.toISOString()}`);
    } catch (error) {
      console.error(`Failed to schedule timeout for booking ${bookingId}:`, error);
    }
  }

  /**
   * Cancel scheduled timeout when driver responds
   */
  static async cancelBookingTimeout(bookingId: number): Promise<void> {
    try {
      // Clear the response deadline when driver responds
      await supabase
        .from('ride_bookings')
        .update({
          response_deadline: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      console.log(`Cancelled timeout for booking ${bookingId}`);
    } catch (error) {
      console.error(`Failed to cancel timeout for booking ${bookingId}:`, error);
    }
  }

  /**
   * Check if booking is within response window
   */
  static async isWithinResponseWindow(bookingId: number): Promise<boolean> {
    try {
      const { data: booking } = await supabase
        .from('ride_bookings')
        .select('response_deadline, status')
        .eq('id', bookingId)
        .single();

      if (!booking || booking.status !== 'pending') {
        return false;
      }

      if (!booking.response_deadline) {
        return true; // No deadline set, assume valid
      }

      return new Date() < new Date(booking.response_deadline);
    } catch (error) {
      console.error(`Failed to check response window for booking ${bookingId}:`, error);
      return false;
    }
  }

  /**
   * Process all timed-out bookings
   */
  private static async processTimeouts(): Promise<void> {
    try {
      console.log('Processing booking timeouts...');

      // 1. Call database function to update timed-out bookings
      const { error: dbError } = await supabase.rpc('process_booking_timeouts');
      
      if (dbError) {
        console.error('Database timeout processing failed:', dbError);
        return;
      }

      // 2. Get newly timed-out bookings that need payment processing
      const { data: timedOutBookings } = await supabase
        .from('ride_bookings')
        .select(`
          id,
          ride_id,
          passenger_id,
          updated_at,
          payments!inner(
            id,
            payment_intent_id,
            status,
            amount
          )
        `)
        .eq('status', 'timeout_cancelled')
        .eq('payments.status', 'authorized')
        .gte('updated_at', new Date(Date.now() - 2 * 60 * 1000).toISOString()); // Updated in last 2 minutes

      if (!timedOutBookings || timedOutBookings.length === 0) {
        console.log('No timed-out bookings to process');
        return;
      }

      console.log(`Processing ${timedOutBookings.length} timed-out bookings`);

      // 3. Process each timed-out booking
      for (const booking of timedOutBookings) {
        try {
          // Use PaymentHoldService to handle the refund
          const refundResult = await PaymentHoldService.refundPaymentHold(
            booking.id, 
            'timeout'
          );

          if (refundResult.success) {
            // Send timeout notification message
            await this.sendTimeoutMessage(booking.id, booking.ride_id);
            console.log(`Processed timeout for booking ${booking.id}`);
          } else {
            console.error(`Failed to process timeout for booking ${booking.id}:`, refundResult.error);
          }

        } catch (error) {
          console.error(`Error processing timeout for booking ${booking.id}:`, error);
        }
      }

    } catch (error) {
      console.error('Error in timeout processing:', error);
    }
  }

  /**
   * Send timeout notification message to chat
   */
  private static async sendTimeoutMessage(bookingId: number, rideId: number): Promise<void> {
    try {
      await supabase
        .from('messages')
        .insert({
          ride_id: rideId,
          sender_id: null, // System message
          content: '⏰ This ride request has timed out. The driver did not respond within 12 hours. Your payment has been refunded automatically.',
          message_type: 'system',
          created_at: new Date().toISOString()
        });

    } catch (error) {
      console.error('Failed to send timeout message:', error);
    }
  }

  /**
   * Get timeout statistics
   */
  static async getTimeoutStats(): Promise<{
    totalTimeouts: number;
    recentTimeouts: number;
    pendingBookings: number;
  }> {
    try {
      // Get total timeout count
      const { count: totalTimeouts } = await supabase
        .from('ride_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'timeout_cancelled');

      // Get recent timeouts (last 24 hours)
      const { count: recentTimeouts } = await supabase
        .from('ride_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'timeout_cancelled')
        .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      // Get pending bookings count
      const { count: pendingBookings } = await supabase
        .from('ride_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      return {
        totalTimeouts: totalTimeouts || 0,
        recentTimeouts: recentTimeouts || 0,
        pendingBookings: pendingBookings || 0
      };

    } catch (error) {
      console.error('Failed to get timeout stats:', error);
      return {
        totalTimeouts: 0,
        recentTimeouts: 0,
        pendingBookings: 0
      };
    }
  }

  /**
   * Force process a specific booking timeout (for testing)
   */
  static async forceTimeoutBooking(bookingId: number): Promise<boolean> {
    try {
      // Update booking to timeout_cancelled
      const { error: updateError } = await supabase
        .from('ride_bookings')
        .update({
          status: 'timeout_cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .eq('status', 'pending');

      if (updateError) {
        console.error('Failed to force timeout booking:', updateError);
        return false;
      }

      // Process the refund
      const refundResult = await PaymentHoldService.refundPaymentHold(bookingId, 'timeout');
      
      return refundResult.success;

    } catch (error) {
      console.error('Failed to force timeout booking:', error);
      return false;
    }
  }
}

// Auto-start the timeout service when the module is imported
// (In a production environment, this would typically be managed by a process manager)
if (typeof window !== 'undefined') {
  // Only start in browser environment, not during SSR
  BookingTimeoutService.start();
}

export default BookingTimeoutService;