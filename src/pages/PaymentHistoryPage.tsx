import React, { useState, useEffect } from 'react';
import { ChevronLeft, Clock, CheckCircle, XCircle, AlertCircle, DollarSign, Calendar, Filter, Download, Eye, Search, CreditCard, Wallet, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';

interface PaymentHistoryData {
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

const PaymentHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [payments, setPayments] = useState<PaymentHistoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<PaymentHistoryData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchPaymentHistory();
    }
  }, [user?.id]);

  const fetchPaymentHistory = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      
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
        .eq('user_id', user.id)
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

      setPayments(paymentsWithMethods);
    } catch (error) {
      console.error('Error fetching payment history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'authorized':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'captured':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'refunded':
        return <RefreshCw className="w-5 h-5 text-blue-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'authorized':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'captured':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'refunded':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusDisplayName = (status: string) => {
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
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPaymentMethod = (payment: PaymentHistoryData) => {
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
  };

  const getPaymentMethodIcon = (payment: PaymentHistoryData) => {
    const method = payment.payment_method_info?.type || payment.payment_method;
    
    switch (method.toLowerCase()) {
      case 'credit_card':
      case 'debit_card':
      case 'card':
        return <CreditCard className="w-4 h-4 text-gray-600" />;
      case 'paypal':
        return <Wallet className="w-4 h-4 text-blue-600" />;
      default:
        return <DollarSign className="w-4 h-4 text-gray-600" />;
    }
  };

  const filteredPayments = payments.filter(payment => {
    const matchesStatus = selectedStatus === 'all' || payment.status === selectedStatus;
    const matchesSearch = searchTerm === '' || 
      payment.amount.toString().includes(searchTerm) ||
      formatPaymentMethod(payment).toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.booking?.ride?.from_location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.booking?.ride?.to_location.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  const totalPaid = payments
    .filter(p => p.status === 'captured')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalRefunded = payments
    .filter(p => p.status === 'refunded')
    .reduce((sum, p) => sum + p.amount, 0);

  const pendingAuthorizations = payments
    .filter(p => p.status === 'authorized')
    .reduce((sum, p) => sum + p.amount, 0);

  const exportToCSV = () => {
    const headers = ['Date', 'Amount', 'Status', 'Payment Method', 'Ride Route', 'Driver', 'Refund Reason'];
    const csvData = filteredPayments.map(payment => [
      formatDate(payment.created_at),
      `$${payment.amount.toFixed(2)}`,
      getStatusDisplayName(payment.status),
      formatPaymentMethod(payment),
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
  };

  const viewPaymentDetails = (payment: PaymentHistoryData) => {
    setSelectedPayment(payment);
    setShowDetailModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading payment history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/profile')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-gray-600" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Payment History</h1>
            </div>
            <button
              onClick={exportToCSV}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Paid</p>
                <p className="text-2xl font-bold text-gray-900">${totalPaid.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <RefreshCw className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Refunded</p>
                <p className="text-2xl font-bold text-gray-900">${totalRefunded.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Auth</p>
                <p className="text-2xl font-bold text-gray-900">${pendingAuthorizations.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by amount, route, or payment method..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="authorized">Authorized</option>
                <option value="captured">Paid</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
          </div>
        </div>

        {/* Payment History Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {filteredPayments.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No payment history found</h3>
              <p className="text-gray-600">
                {payments.length === 0 
                  ? "You haven't made any payments yet."
                  : "No payments match your current filters."
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment Method
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ride Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(payment.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900">
                          ${payment.amount.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {payment.currency.toUpperCase()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(payment.status)}
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(payment.status)}`}>
                            {getStatusDisplayName(payment.status)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getPaymentMethodIcon(payment)}
                          <span className="text-sm text-gray-900">
                            {formatPaymentMethod(payment)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {payment.booking?.ride ? (
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {payment.booking.ride.from_location} → {payment.booking.ride.to_location}
                            </div>
                            <div className="text-xs text-gray-500">
                              {payment.booking.seats_booked} seat{payment.booking.seats_booked !== 1 ? 's' : ''}
                              {payment.booking.ride.driver && (
                                <> • Driver: {payment.booking.ride.driver.display_name}</>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <button
                          onClick={() => viewPaymentDetails(payment)}
                          className="flex items-center space-x-1 text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          <span>Details</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Payment Details</h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <XCircle className="w-6 h-6 text-gray-600" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Information</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Amount</label>
                      <p className="text-lg font-bold text-gray-900">${selectedPayment.amount.toFixed(2)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Status</label>
                      <div className="flex items-center space-x-2 mt-1">
                        {getStatusIcon(selectedPayment.status)}
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(selectedPayment.status)}`}>
                          {getStatusDisplayName(selectedPayment.status)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Payment Method</label>
                      <div className="flex items-center space-x-2 mt-1">
                        {getPaymentMethodIcon(selectedPayment)}
                        <p className="text-sm text-gray-900">{formatPaymentMethod(selectedPayment)}</p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Payment Date</label>
                      <p className="text-sm text-gray-900">{formatDate(selectedPayment.created_at)}</p>
                    </div>
                    {selectedPayment.captured_at && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600">Captured Date</label>
                        <p className="text-sm text-gray-900">{formatDate(selectedPayment.captured_at)}</p>
                      </div>
                    )}
                    {selectedPayment.refunded_at && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600">Refund Date</label>
                        <p className="text-sm text-gray-900">{formatDate(selectedPayment.refunded_at)}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction Details</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Transaction ID</label>
                      <p className="text-sm text-gray-900 font-mono">
                        {selectedPayment.payment_intent_id || selectedPayment.authorization_id || 'N/A'}
                      </p>
                    </div>
                    {selectedPayment.expires_at && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600">Authorization Expires</label>
                        <p className="text-sm text-gray-900">{formatDate(selectedPayment.expires_at)}</p>
                      </div>
                    )}
                    {selectedPayment.refund_reason && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600">Refund Reason</label>
                        <p className="text-sm text-gray-900">{selectedPayment.refund_reason}</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Currency</label>
                      <p className="text-sm text-gray-900">{selectedPayment.currency.toUpperCase()}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ride Information */}
              {selectedPayment.booking?.ride && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Ride Information</h3>
                  <div className="bg-gray-50 rounded-lg p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600">Route</label>
                        <p className="text-sm text-gray-900 font-medium">
                          {selectedPayment.booking.ride.from_location} → {selectedPayment.booking.ride.to_location}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600">Departure</label>
                        <p className="text-sm text-gray-900">
                          {formatDate(selectedPayment.booking.ride.departure_time)}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600">Seats Booked</label>
                        <p className="text-sm text-gray-900">
                          {selectedPayment.booking.seats_booked} seat{selectedPayment.booking.seats_booked !== 1 ? 's' : ''}
                        </p>
                      </div>
                      {selectedPayment.booking.ride.driver && (
                        <div>
                          <label className="block text-sm font-medium text-gray-600">Driver</label>
                          <p className="text-sm text-gray-900">{selectedPayment.booking.ride.driver.display_name}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t bg-gray-50">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentHistoryPage;