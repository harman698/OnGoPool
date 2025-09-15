import { supabase } from './supabase';

export interface PaymentHistoryData {
  id: number;
  booking_id?: number;
  amount: number;
  currency: string;
  status: 'authorized' | 'captured' | 'refunded';
  payment_method: string;
  payment_intent_id?: string;
  authorization_id?: string;
  expires_at?: string;
  captured_at?: string;
  refund_reason?: string;
  refunded_at?: string;
  created_at: string;
  updated_at?: string;
  booking?: {
    id: number;
    ride?: {
      id: number;
      from_location: string;
      to_location: string;
      departure_time: string;
      driver?: {
        display_name: string;
        email: string;
      };
    };
    seats_booked: number;
  };
  payment_method_info?: {
    type: string;
    last_four?: string;
    brand?: string;
  };
}

export interface PaymentSummary {
  totalPaid: number;
  totalRefunded: number;
  pendingAuthorizations: number;
  totalTransactions: number;
}

export class PaymentHistoryService {
  /**
   * Fetch payment history for a specific user (passenger)
   */
  static async fetchPaymentHistory(userId: string): Promise<PaymentHistoryData[]> {
    try {
      // Fetch passenger payments with booking and ride details
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          booking:ride_bookings(
            id,
            seats_booked,
            ride:rides(
              id,
              from_location,
              to_location,
              departure_time,
              driver:users(display_name, email)
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch payment method details for each payment
      const paymentsWithMethods = await Promise.all(
        (data || []).map(async (payment) => {
          let paymentMethodInfo = null;
          
          // Try to extract payment method ID from payment_intent_id or use payment_method directly
          if (payment.payment_method && payment.payment_method.startsWith('pm_')) {
            try {
              const { data: methodData, error: methodError } = await supabase
                .from('payment_methods')
                .select('type, last_four, brand')
                .eq('id', payment.payment_method)
                .single();

              if (!methodError && methodData) {
                paymentMethodInfo = methodData;
              }
            } catch (err) {
              console.debug('Payment method lookup failed:', err);
            }
          }

          return {
            ...payment,
            payment_method_info: paymentMethodInfo
          } as PaymentHistoryData;
        })
      );

      return paymentsWithMethods;
    } catch (error) {
      console.error('Error fetching payment history:', error);
      throw error;
    }
  }

  /**
   * Calculate payment summary statistics for a user
   */
  static calculatePaymentSummary(payments: PaymentHistoryData[]): PaymentSummary {
    const totalPaid = payments
      .filter(p => p.status === 'captured')
      .reduce((sum, p) => sum + p.amount, 0);

    const totalRefunded = payments
      .filter(p => p.status === 'refunded')
      .reduce((sum, p) => sum + p.amount, 0);

    const pendingAuthorizations = payments
      .filter(p => p.status === 'authorized')
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      totalPaid,
      totalRefunded,
      pendingAuthorizations,
      totalTransactions: payments.length
    };
  }

  /**
   * Get payment status display name
   */
  static getStatusDisplayName(status: string): string {
    switch (status) {
      case 'authorized':
        return 'Authorized';
      case 'captured':
        return 'Paid';
      case 'refunded':
        return 'Refunded';
      default:
        return status;
    }
  }

  /**
   * Format payment method display string
   */
  static formatPaymentMethod(payment: PaymentHistoryData): string {
    if (payment.payment_method_info) {
      const { type, last_four, brand } = payment.payment_method_info;
      if (type === 'credit_card' || type === 'debit_card') {
        return `${brand || 'Card'} •••• ${last_four}`;
      } else if (type === 'paypal') {
        return 'PayPal';
      }
    }
    
    // Fallback to basic payment method
    switch (payment.payment_method.toLowerCase()) {
      case 'card':
      case 'credit_card':
        return 'Credit Card';
      case 'paypal':
        return 'PayPal';
      default:
        return payment.payment_method;
    }
  }

  /**
   * Check if a payment is expired (for authorized payments)
   */
  static isPaymentExpired(payment: PaymentHistoryData): boolean {
    if (payment.status !== 'authorized' || !payment.expires_at) {
      return false;
    }
    
    return new Date() > new Date(payment.expires_at);
  }

  /**
   * Filter payments by status
   */
  static filterByStatus(payments: PaymentHistoryData[], status: string): PaymentHistoryData[] {
    if (status === 'all') return payments;
    return payments.filter(payment => payment.status === status);
  }

  /**
   * Search payments by multiple criteria
   */
  static searchPayments(payments: PaymentHistoryData[], searchTerm: string): PaymentHistoryData[] {
    if (!searchTerm.trim()) return payments;
    
    const term = searchTerm.toLowerCase();
    return payments.filter(payment => 
      payment.amount.toString().includes(term) ||
      this.formatPaymentMethod(payment).toLowerCase().includes(term) ||
      payment.status.toLowerCase().includes(term) ||
      payment.booking?.ride?.from_location.toLowerCase().includes(term) ||
      payment.booking?.ride?.to_location.toLowerCase().includes(term) ||
      payment.booking?.ride?.driver?.display_name.toLowerCase().includes(term)
    );
  }

  /**
   * Export payments to CSV format
   */
  static exportToCSV(payments: PaymentHistoryData[]): void {
    const headers = ['Date', 'Amount', 'Status', 'Payment Method', 'Ride Route', 'Driver', 'Refund Reason'];
    const csvData = payments.map(payment => [
      new Date(payment.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      `$${payment.amount.toFixed(2)}`,
      this.getStatusDisplayName(payment.status),
      this.formatPaymentMethod(payment),
      payment.booking?.ride ? 
        `${payment.booking.ride.from_location} → ${payment.booking.ride.to_location}` : 'N/A',
      payment.booking?.ride?.driver?.display_name || 'N/A',
      payment.refund_reason || ''
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-history-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Get payments by date range
   */
  static filterByDateRange(
    payments: PaymentHistoryData[], 
    startDate: Date, 
    endDate: Date
  ): PaymentHistoryData[] {
    return payments.filter(payment => {
      const paymentDate = new Date(payment.created_at);
      return paymentDate >= startDate && paymentDate <= endDate;
    });
  }

  /**
   * Get recent payments (last 30 days)
   */
  static getRecentPayments(payments: PaymentHistoryData[]): PaymentHistoryData[] {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return this.filterByDateRange(payments, thirtyDaysAgo, new Date());
  }

  /**
   * Get payment statistics by status for analytics
   */
  static getPaymentStatsByStatus(payments: PaymentHistoryData[]): Record<string, number> {
    return payments.reduce((stats, payment) => {
      stats[payment.status] = (stats[payment.status] || 0) + 1;
      return stats;
    }, {} as Record<string, number>);
  }

  /**
   * Get monthly payment breakdown for analytics
   */
  static getMonthlyPaymentBreakdown(payments: PaymentHistoryData[]): Array<{
    month: string;
    totalAmount: number;
    transactionCount: number;
  }> {
    const monthlyData = payments.reduce((acc, payment) => {
      const date = new Date(payment.created_at);
      const monthKey = date.toISOString().slice(0, 7); // YYYY-MM format
      
      if (!acc[monthKey]) {
        acc[monthKey] = { totalAmount: 0, transactionCount: 0 };
      }
      
      if (payment.status === 'captured') {
        acc[monthKey].totalAmount += payment.amount;
      }
      acc[monthKey].transactionCount += 1;
      
      return acc;
    }, {} as Record<string, { totalAmount: number; transactionCount: number }>);

    return Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        totalAmount: data.totalAmount,
        transactionCount: data.transactionCount
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }
}