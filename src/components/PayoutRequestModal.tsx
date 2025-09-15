import React, { useState } from 'react';
import { X, DollarSign, CreditCard, Wallet, AlertCircle, ChevronDown } from 'lucide-react';
import { EarningsService } from '../lib/earningsService';
import { useAuthStore } from '../store/authStore';
import { formatPayout } from '../utils/currency';

interface PayoutRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableAmount: number;
  onSuccess: () => void;
}

interface CanadianBank {
  id: string;
  name: string;
  institutionNumber: string;
  shortName: string;
}

const CANADIAN_BANKS: CanadianBank[] = [
  { id: 'bmo', name: 'Bank of Montreal (BMO)', institutionNumber: '001', shortName: 'BMO' },
  { id: 'scotia', name: 'The Bank of Nova Scotia (Scotiabank)', institutionNumber: '002', shortName: 'Scotiabank' },
  { id: 'rbc', name: 'Royal Bank of Canada (RBC)', institutionNumber: '003', shortName: 'RBC' },
  { id: 'td', name: 'The Toronto-Dominion Bank (TD)', institutionNumber: '004', shortName: 'TD' },
  { id: 'national', name: 'National Bank of Canada', institutionNumber: '006', shortName: 'National Bank' },
  { id: 'cibc', name: 'Canadian Imperial Bank of Commerce (CIBC)', institutionNumber: '010', shortName: 'CIBC' },
  { id: 'hsbc', name: 'HSBC Bank Canada', institutionNumber: '016', shortName: 'HSBC' },
  { id: 'desjardins', name: 'Desjardins Credit Union', institutionNumber: '815', shortName: 'Desjardins' },
  { id: 'tangerine', name: 'Tangerine Bank', institutionNumber: '614', shortName: 'Tangerine' },
  { id: 'presidents', name: 'President\'s Choice Financial', institutionNumber: '623', shortName: 'PC Financial' }
];

const PayoutRequestModal: React.FC<PayoutRequestModalProps> = ({
  isOpen,
  onClose,
  availableAmount,
  onSuccess
}) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'bank' | 'paypal'>('bank');
  const [requestAmount, setRequestAmount] = useState(availableAmount);
  const [selectedBank, setSelectedBank] = useState<CanadianBank | null>(null);
  const [showBankDropdown, setShowBankDropdown] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState({
    accountNumber: '',
    transitNumber: '',
    institutionNumber: '',
    paypalEmail: '',
    accountHolderName: ''
  });
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError('');
    setLoading(true);

    try {
      // Validate form
      if (requestAmount <= 0 || requestAmount > availableAmount) {
        throw new Error('Invalid payout amount');
      }

      if (selectedMethod === 'bank') {
        if (!paymentDetails.accountNumber || !paymentDetails.transitNumber || !paymentDetails.institutionNumber || !paymentDetails.accountHolderName) {
          throw new Error('Please fill in all Canadian bank account details');
        }
      } else {
        if (!paymentDetails.paypalEmail) {
          throw new Error('Please enter your PayPal email');
        }
      }

      // Create payout request
      const payoutRequest = await EarningsService.requestPayout(
        user.id,
        requestAmount,
        selectedMethod === 'bank' ? 'bank_transfer' : 'paypal',
        selectedMethod === 'bank' ? {
          accountNumber: paymentDetails.accountNumber,
          transitNumber: paymentDetails.transitNumber,
          institutionNumber: paymentDetails.institutionNumber,
          accountHolderName: paymentDetails.accountHolderName
        } : {
          email: paymentDetails.paypalEmail
        }
      );

      if (payoutRequest) {
        onSuccess();
        onClose();
      } else {
        throw new Error('Failed to create payout request');
      }
    } catch (error) {
      console.error('Error creating payout request:', error);
      setError(error instanceof Error ? error.message : 'Failed to request payout');
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    setRequestAmount(Math.min(value, availableAmount));
  };

  const handleBankSelect = (bank: CanadianBank) => {
    setSelectedBank(bank);
    setShowBankDropdown(false);
    setPaymentDetails(prev => ({
      ...prev,
      institutionNumber: bank.institutionNumber
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Request Payout</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={loading}
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center space-x-2">
              <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* Available Amount Display */}
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-1">
              <DollarSign size={16} className="text-green-600" />
              <span className="text-sm font-medium text-green-800">Available for Payout</span>
            </div>
            <p className="text-2xl font-bold text-green-900">${availableAmount.toFixed(2)}</p>
            <p className="text-xs text-green-700 mt-1">Net earnings after service fees</p>
          </div>

          {/* Payout Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payout Amount
            </label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="number"
                value={requestAmount}
                onChange={handleAmountChange}
                min="1"
                max={availableAmount}
                step="0.01"
                required
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter amount"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Maximum: {formatPayout(availableAmount)}
            </p>
          </div>

          {/* Payment Method Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Payment Method
            </label>
            <div className="space-y-3">
              <div
                className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedMethod === 'bank'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedMethod('bank')}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    selectedMethod === 'bank' ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                    {selectedMethod === 'bank' && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    )}
                  </div>
                  <CreditCard size={20} className="text-gray-600" />
                  <div>
                    <p className="font-medium text-gray-900">Canadian Bank Transfer</p>
                    <p className="text-sm text-gray-500">Direct deposit to your Canadian bank account</p>
                  </div>
                </div>
              </div>

              <div
                className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedMethod === 'paypal'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedMethod('paypal')}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    selectedMethod === 'paypal' ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                    {selectedMethod === 'paypal' && (
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                    )}
                  </div>
                  <Wallet size={20} className="text-gray-600" />
                  <div>
                    <p className="font-medium text-gray-900">PayPal</p>
                    <p className="text-sm text-gray-500">Transfer to your PayPal account</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Details Form */}
          {selectedMethod === 'bank' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  value={paymentDetails.accountHolderName}
                  onChange={(e) => setPaymentDetails(prev => ({ ...prev, accountHolderName: e.target.value }))}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Full name on account"
                />
              </div>

              {/* Canadian Bank Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Your Bank
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowBankDropdown(!showBankDropdown)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left flex items-center justify-between"
                  >
                    <span className={selectedBank ? 'text-gray-900' : 'text-gray-500'}>
                      {selectedBank ? selectedBank.name : 'Choose your Canadian bank'}
                    </span>
                    <ChevronDown size={16} className={`transition-transform ${showBankDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {showBankDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {CANADIAN_BANKS.map((bank) => (
                        <button
                          key={bank.id}
                          type="button"
                          onClick={() => handleBankSelect(bank)}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-gray-900">{bank.shortName}</span>
                            <span className="text-sm text-gray-500">#{bank.institutionNumber}</span>
                          </div>
                          <div className="text-sm text-gray-600 mt-1">{bank.name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedBank && (
                  <div className="mt-2 p-2 bg-green-50 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-700">Institution Number: <strong>{selectedBank.institutionNumber}</strong></span>
                      <span className="text-green-600">✓ Auto-filled</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Number
                </label>
                <input
                  type="text"
                  value={paymentDetails.accountNumber}
                  onChange={(e) => setPaymentDetails(prev => ({ ...prev, accountNumber: e.target.value }))}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="7-12 digit account number"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transit Number
                  </label>
                  <input
                    type="text"
                    value={paymentDetails.transitNumber}
                    onChange={(e) => setPaymentDetails(prev => ({ ...prev, transitNumber: e.target.value }))}
                    required
                    maxLength={5}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="5-digit transit"
                  />
                  <p className="text-xs text-gray-500 mt-1">Branch/transit number</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Institution Number
                  </label>
                  <input
                    type="text"
                    value={paymentDetails.institutionNumber}
                    onChange={(e) => setPaymentDetails(prev => ({ ...prev, institutionNumber: e.target.value }))}
                    required
                    maxLength={3}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      selectedBank ? 'bg-gray-100' : ''
                    }`}
                    placeholder="3-digit bank"
                    readOnly={!!selectedBank}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedBank ? 'Auto-filled from bank selection' : 'Bank identification number'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedMethod === 'paypal' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PayPal Email
              </label>
              <input
                type="email"
                value={paymentDetails.paypalEmail}
                onChange={(e) => setPaymentDetails(prev => ({ ...prev, paypalEmail: e.target.value }))}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="your@email.com"
              />
            </div>
          )}

          {/* Processing Info */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Processing Information</p>
                <ul className="mt-1 space-y-1 text-xs">
                  <li>• Canadian bank transfers typically take 1-3 business days</li>
                  <li>• PayPal transfers usually process within 24 hours</li>
                  <li>• All requests are reviewed before processing</li>
                  <li>• Ensure all banking details are accurate for Canadian banks</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Request Payout'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PayoutRequestModal;