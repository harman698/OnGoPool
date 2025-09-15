import React, { useState } from 'react';
import { X, CreditCard, Wallet, Apple, Smartphone, AlertCircle, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';

interface PaymentMethodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingMethod?: PaymentMethod | null;
}

interface PaymentMethod {
  id: string;
  type: 'credit_card' | 'debit_card' | 'paypal' | 'apple_pay' | 'google_pay';
  last_four?: string;
  expiry_month?: number;
  expiry_year?: number;
  cardholder_name?: string;
  brand?: string;
  email?: string;
  is_default?: boolean;
}

const PaymentMethodModal: React.FC<PaymentMethodModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editingMethod
}) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<PaymentMethod['type']>(
    editingMethod?.type || 'credit_card'
  );
  const [formData, setFormData] = useState({
    cardNumber: '',
    expiryMonth: editingMethod?.expiry_month?.toString() || '',
    expiryYear: editingMethod?.expiry_year?.toString() || '',
    cvv: '',
    cardholderName: editingMethod?.cardholder_name || '',
    email: editingMethod?.email || '',
    isDefault: editingMethod?.is_default || false
  });
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError('');
    setLoading(true);

    try {
      if (selectedType === 'credit_card' || selectedType === 'debit_card') {
        // Validate card details
        if (!formData.cardNumber || !formData.expiryMonth || !formData.expiryYear || !formData.cvv || !formData.cardholderName) {
          throw new Error('Please fill in all card details');
        }

        // Basic card number validation
        const cleanCardNumber = formData.cardNumber.replace(/\s/g, '');
        if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
          throw new Error('Invalid card number');
        }

        // Detect card brand
        const cardBrand = detectCardBrand(cleanCardNumber);

        const paymentMethod = {
          user_id: user.id,
          type: selectedType,
          last_four: cleanCardNumber.slice(-4),
          expiry_month: parseInt(formData.expiryMonth),
          expiry_year: parseInt(formData.expiryYear),
          cardholder_name: formData.cardholderName,
          brand: cardBrand,
          is_default: formData.isDefault,
          created_at: new Date().toISOString()
        };

        if (editingMethod) {
          const { error: updateError } = await supabase
            .from('payment_methods')
            .update(paymentMethod)
            .eq('id', editingMethod.id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from('payment_methods')
            .insert(paymentMethod);
          if (insertError) throw insertError;
        }
      } else if (selectedType === 'paypal') {
        if (!formData.email) {
          throw new Error('Please enter your PayPal email');
        }

        const paymentMethod = {
          user_id: user.id,
          type: selectedType,
          email: formData.email,
          is_default: formData.isDefault,
          created_at: new Date().toISOString()
        };

        if (editingMethod) {
          const { error: updateError } = await supabase
            .from('payment_methods')
            .update(paymentMethod)
            .eq('id', editingMethod.id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from('payment_methods')
            .insert(paymentMethod);
          if (insertError) throw insertError;
        }
      } else {
        // Digital wallets (Apple Pay, Google Pay)
        const paymentMethod = {
          user_id: user.id,
          type: selectedType,
          is_default: formData.isDefault,
          created_at: new Date().toISOString()
        };

        if (editingMethod) {
          const { error: updateError } = await supabase
            .from('payment_methods')
            .update(paymentMethod)
            .eq('id', editingMethod.id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from('payment_methods')
            .insert(paymentMethod);
          if (insertError) throw insertError;
        }
      }

      // If this is set as default, update all other methods
      if (formData.isDefault) {
        await supabase
          .from('payment_methods')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .neq('id', editingMethod?.id || '');
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving payment method:', error);
      setError(error instanceof Error ? error.message : 'Failed to save payment method');
    } finally {
      setLoading(false);
    }
  };

  const detectCardBrand = (cardNumber: string): string => {
    const patterns = {
      visa: /^4[0-9]{12}(?:[0-9]{3})?$/,
      mastercard: /^5[1-5][0-9]{14}$/,
      amex: /^3[47][0-9]{13}$/,
      discover: /^6(?:011|5[0-9]{2})[0-9]{12}$/
    };

    for (const [brand, pattern] of Object.entries(patterns)) {
      if (pattern.test(cardNumber)) {
        return brand;
      }
    }
    return 'unknown';
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    setFormData(prev => ({ ...prev, cardNumber: formatted }));
  };

  const paymentTypes = [
    { 
      type: 'credit_card' as const, 
      label: 'Credit Card', 
      icon: CreditCard, 
      description: 'Visa, Mastercard, Amex, Discover' 
    },
    { 
      type: 'debit_card' as const, 
      label: 'Debit Card', 
      icon: CreditCard, 
      description: 'Bank debit cards' 
    },
    { 
      type: 'paypal' as const, 
      label: 'PayPal', 
      icon: Wallet, 
      description: 'Pay with your PayPal account' 
    },
    { 
      type: 'apple_pay' as const, 
      label: 'Apple Pay', 
      icon: Apple, 
      description: 'Quick and secure payments' 
    },
    { 
      type: 'google_pay' as const, 
      label: 'Google Pay', 
      icon: Smartphone, 
      description: 'Fast checkout with Google' 
    }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {editingMethod ? 'Edit Payment Method' : 'Add Payment Method'}
          </h2>
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

          {/* Payment Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Payment Type
            </label>
            <div className="space-y-2">
              {paymentTypes.map((type) => (
                <div
                  key={type.type}
                  className={`border-2 rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedType === type.type
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedType(type.type)}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      selectedType === type.type ? 'border-blue-500' : 'border-gray-300'
                    }`}>
                      {selectedType === type.type && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </div>
                    <type.icon size={20} className="text-gray-600" />
                    <div>
                      <p className="font-medium text-gray-900">{type.label}</p>
                      <p className="text-sm text-gray-500">{type.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card Details Form */}
          {(selectedType === 'credit_card' || selectedType === 'debit_card') && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cardholder Name
                </label>
                <input
                  type="text"
                  value={formData.cardholderName}
                  onChange={(e) => setFormData(prev => ({ ...prev, cardholderName: e.target.value }))}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Number
                </label>
                <input
                  type="text"
                  value={formData.cardNumber}
                  onChange={handleCardNumberChange}
                  required
                  maxLength={19}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="1234 5678 9012 3456"
                />
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Month
                  </label>
                  <select
                    value={formData.expiryMonth}
                    onChange={(e) => setFormData(prev => ({ ...prev, expiryMonth: e.target.value }))}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">MM</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {(i + 1).toString().padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Year
                  </label>
                  <select
                    value={formData.expiryYear}
                    onChange={(e) => setFormData(prev => ({ ...prev, expiryYear: e.target.value }))}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">YYYY</option>
                    {Array.from({ length: 10 }, (_, i) => {
                      const year = new Date().getFullYear() + i;
                      return (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CVV
                  </label>
                  <input
                    type="text"
                    value={formData.cvv}
                    onChange={(e) => setFormData(prev => ({ ...prev, cvv: e.target.value.replace(/\D/g, '') }))}
                    required
                    maxLength={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="123"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PayPal Email */}
          {selectedType === 'paypal' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PayPal Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="your@email.com"
              />
            </div>
          )}

          {/* Digital Wallet Setup Info */}
          {(selectedType === 'apple_pay' || selectedType === 'google_pay') && (
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium">Setup Information</p>
                  <p className="mt-1">
                    {selectedType === 'apple_pay' 
                      ? 'Apple Pay will be available during checkout on supported devices with Touch ID or Face ID.'
                      : 'Google Pay will be available during checkout on supported Android devices and browsers.'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Set as Default */}
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="isDefault"
              checked={formData.isDefault}
              onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="isDefault" className="text-sm text-gray-700">
              Set as default payment method
            </label>
          </div>

          {/* Security Info */}
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-start space-x-2">
              <Check size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-800">
                <p className="font-medium">Secure & Encrypted</p>
                <p className="mt-1">Your payment information is encrypted and stored securely. We never store your full card number or CVV.</p>
              </div>
            </div>
          </div>

          {/* Submit Buttons */}
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
              className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : (editingMethod ? 'Update Method' : 'Add Method')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentMethodModal;