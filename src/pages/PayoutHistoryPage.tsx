import React, { useState, useEffect } from 'react';
import { ChevronLeft, Clock, CheckCircle, XCircle, AlertCircle, DollarSign, Calendar, Filter, Download, Eye, Search } from 'lucide-react';
import { formatPayout } from '../utils/currency';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { EarningsService } from '../lib/earningsService';
import { PayoutRequest, Earning } from '../types';
import { supabase } from '../lib/supabase';

interface PayoutHistoryData extends PayoutRequest {
  earnings?: Earning[];
  totalEarnings?: number;
}

const PayoutHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [payoutRequests, setPayoutRequests] = useState<PayoutHistoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPayout, setSelectedPayout] = useState<PayoutHistoryData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchPayoutHistory();
    }
  }, [user?.id]);

  const fetchPayoutHistory = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      
      // Fetch payout requests
      const requests = await EarningsService.fetchPayoutRequests(user.id);
      
      // Fetch associated earnings for each payout request
      const requestsWithEarnings = await Promise.all(
        requests.map(async (request) => {
          try {
            const { data: earnings, error } = await supabase
              .from('earnings')
              .select(`
                *,
                ride:rides(id, from_location, to_location, departure_time),
                booking:ride_bookings(id, seats_booked, passenger:users(display_name, email))
              `)
              .eq('payout_request_id', request.id);

            if (error) {
              console.error('Error fetching earnings for payout:', error);
              return request;
            }

            return {
              ...request,
              earnings: earnings || [],
              totalEarnings: (earnings || []).reduce((sum, earning) => sum + parseFloat(earning.amount.toString()), 0)
            } as PayoutHistoryData;
          } catch (error) {
            console.error('Error processing payout request:', error);
            return request;
          }
        })
      );

      setPayoutRequests(requestsWithEarnings);
    } catch (error) {
      console.error('Error fetching payout history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'approved':
        return <CheckCircle className="w-5 h-5 text-blue-500" />;
      case 'paid':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'approved':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'paid':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
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

  const formatPaymentMethod = (method?: string) => {
    switch (method) {
      case 'bank_transfer':
        return 'Bank Transfer';
      case 'paypal':
        return 'PayPal';
      default:
        return method || 'N/A';
    }
  };

  const filteredPayouts = payoutRequests.filter(payout => {
    const matchesStatus = selectedStatus === 'all' || payout.status === selectedStatus;
    const matchesSearch = searchTerm === '' || 
      payout.payment_method?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payout.status?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payout.amount.toString().includes(searchTerm);
    
    return matchesStatus && matchesSearch;
  });

  const totalPaidOut = payoutRequests
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

  const pendingAmount = payoutRequests
    .filter(p => p.status === 'pending' || p.status === 'approved')
    .reduce((sum, p) => sum + parseFloat(p.amount.toString()), 0);

  const exportToCSV = () => {
    const headers = ['Date', 'Amount', 'Status', 'Payment Method', 'Processed Date', 'Notes'];
    const csvData = filteredPayouts.map(payout => [
      formatDate(payout.requested_at),
      formatPayout(parseFloat(payout.amount.toString())),
      payout.status || 'N/A',
      formatPaymentMethod(payout.payment_method),
      formatDate(payout.processed_at),
      payout.notes || ''
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payout-history-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const viewPayoutDetails = (payout: PayoutHistoryData) => {
    setSelectedPayout(payout);
    setShowDetailModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading payout history...</p>
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
              <h1 className="text-2xl font-bold text-gray-900">Payout History</h1>
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
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Paid Out</p>
                <p className="text-2xl font-bold text-gray-900">${totalPaidOut.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Amount</p>
                <p className="text-2xl font-bold text-gray-900">${pendingAmount.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Requests</p>
                <p className="text-2xl font-bold text-gray-900">{payoutRequests.length}</p>
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
                  placeholder="Search by amount, method, or status..."
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
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        </div>

        {/* Payout History Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {filteredPayouts.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No payout history found</h3>
              <p className="text-gray-600">
                {payoutRequests.length === 0 
                  ? "You haven't made any payout requests yet."
                  : "No payouts match your current filters."
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Request Date
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
                      Processed Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPayouts.map((payout) => (
                    <tr key={payout.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(payout.requested_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900">
                          ${parseFloat(payout.amount.toString()).toFixed(2)}
                        </div>
                        {payout.earnings && payout.earnings.length > 0 && (
                          <div className="text-xs text-gray-500">
                            {payout.earnings.length} earning{payout.earnings.length !== 1 ? 's' : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(payout.status || 'pending')}
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(payout.status || 'pending')}`}>
                            {payout.status || 'Pending'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatPaymentMethod(payout.payment_method)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(payout.processed_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <button
                          onClick={() => viewPayoutDetails(payout)}
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
      {showDetailModal && selectedPayout && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Payout Request Details</h2>
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
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Payout Information</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Amount</label>
                      <p className="text-lg font-bold text-gray-900">${parseFloat(selectedPayout.amount.toString()).toFixed(2)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Status</label>
                      <div className="flex items-center space-x-2 mt-1">
                        {getStatusIcon(selectedPayout.status || 'pending')}
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(selectedPayout.status || 'pending')}`}>
                          {selectedPayout.status || 'Pending'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Payment Method</label>
                      <p className="text-sm text-gray-900">{formatPaymentMethod(selectedPayout.payment_method)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Request Date</label>
                      <p className="text-sm text-gray-900">{formatDate(selectedPayout.requested_at)}</p>
                    </div>
                    {selectedPayout.processed_at && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600">Processed Date</label>
                        <p className="text-sm text-gray-900">{formatDate(selectedPayout.processed_at)}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    {selectedPayout.payment_details ? (
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                        {JSON.stringify(selectedPayout.payment_details, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-gray-500">No payment details available</p>
                    )}
                  </div>
                  {selectedPayout.notes && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-600">Notes</label>
                      <p className="text-sm text-gray-900 mt-1">{selectedPayout.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Associated Earnings */}
              {selectedPayout.earnings && selectedPayout.earnings.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Associated Earnings ({selectedPayout.earnings.length})
                  </h3>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                              Date
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                              Amount
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                              Ride
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">
                              Passenger
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedPayout.earnings.map((earning) => (
                            <tr key={earning.id}>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {new Date(earning.earning_date).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                ${parseFloat(earning.amount.toString()).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {earning.ride ? 
                                  `${earning.ride.from_location} → ${earning.ride.to_location}` : 
                                  'N/A'
                                }
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {earning.booking?.passenger?.display_name || 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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

export default PayoutHistoryPage;