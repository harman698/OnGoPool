import React, { useState, useEffect } from 'react';
import { X, CreditCard, Lock, Check, Plus, Apple, Smartphone, Wallet } from 'lucide-react';
import { PaymentHoldService, PaymentHoldData } from '../lib/paymentHoldService';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import PayPalButton from './PayPalButton';

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

interface PaymentModalProps {
  amount: number;
  bookingId?: number;
  userId?: string;
  usePaymentHold?: boolean; // New prop to enable payment hold mode
  onSuccess: (paymentData: any) => void;
  onCancel: () => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  amount,
  bookingId,
  userId,
  usePaymentHold = false,
  onSuccess,
  onCancel,
}) => {
  const { user } = useAuthStore();
  const [processing, setProcessing] = useState(false);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(true);
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [useNewPaymentMethod, setUseNewPaymentMethod] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [cardData, setCardData] = useState({
    number: '',
    expiry: '',
    cvc: '',
    name: '',
  });
  const [savePaymentMethod, setSavePaymentMethod] = useState(false);

  // Load saved payment methods on component mount
  useEffect(() => {
    if (user) {
      fetchSavedPaymentMethods();
    }
  }, [user]);

  const fetchSavedPaymentMethods = async () => {
    if (!user) return;

    try {
      setLoadingPaymentMethods(true);
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const methods = data || [];
      setSavedPaymentMethods(methods);
      
      // Auto-select default payment method
      const defaultMethod = methods.find(method => method.is_default);
      if (defaultMethod) {
        setSelectedPaymentMethod(defaultMethod);
      } else if (methods.length > 0) {
        setSelectedPaymentMethod(methods[0]);
      } else {
        setUseNewPaymentMethod(true);
      }
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      setUseNewPaymentMethod(true);
    } finally {
      setLoadingPaymentMethods(false);
    }
  };

  const saveNewPaymentMethod = async (paymentMethodData: any) => {
    if (!user || !savePaymentMethod) return;

    try {
      // Parse expiry for storage
      const [expiryMonth, expiryYear] = cardData.expiry.split('/');
      const fullYear = expiryYear ? `20${expiryYear}` : null;

      // Determine if this should be the default method
      const isFirstMethod = savedPaymentMethods.length === 0;

      const newMethod = {
        user_id: user.id,
        type: paymentMethod === 'card' ? 'credit_card' : paymentMethod,
        last_four: cardData.number.replace(/\s/g, '').slice(-4),
        expiry_month: expiryMonth ? parseInt(expiryMonth) : null,
        expiry_year: fullYear ? parseInt(fullYear) : null,
        cardholder_name: cardData.name,
        brand: 'visa', // Mock brand detection
        is_default: isFirstMethod,
        is_active: true
      };

      const { data, error } = await supabase
        .from('payment_methods')
        .insert([newMethod])
        .select()
        .single();

      if (error) throw error;

      console.log('Payment method saved:', data);
      
      // Update local state to include the new method
      setSavedPaymentMethods(prev => [data, ...prev]);
      
    } catch (error) {
      console.error('Error saving payment method:', error);
      // Don't fail the payment if saving fails
    }
  };

  const handlePayment = async () => {
    setProcessing(true);
    
    try {
      console.log('PaymentModal - Starting payment process:', {
        usePaymentHold,
        bookingId,
        userId,
        amount,
        selectedPaymentMethod: selectedPaymentMethod?.id,
        useNewPaymentMethod,
        paymentMethod
      });

      let paymentMethodData;
      
      if (useNewPaymentMethod) {
        // Using new payment method - validate card data
        if (!cardData.number || !cardData.expiry || !cardData.cvc || !cardData.name) {
          console.error('PaymentModal - Card validation failed:', cardData);
          alert('Please fill in all payment details');
          return;
        }
        
        paymentMethodData = {
          id: `pm_new_${Date.now()}`,
          type: paymentMethod,
          last4: cardData.number.slice(-4),
          brand: 'visa' // Mock brand detection
        };
        console.log('PaymentModal - Created new payment method:', paymentMethodData);
      } else if (selectedPaymentMethod) {
        // Using saved payment method
        paymentMethodData = {
          id: selectedPaymentMethod.id,
          type: selectedPaymentMethod.type,
          last4: selectedPaymentMethod.last_four,
          brand: selectedPaymentMethod.brand
        };
        console.log('PaymentModal - Using saved payment method:', paymentMethodData);
      } else {
        console.error('PaymentModal - No payment method selected');
        alert('Please select a payment method');
        return;
      }

      // CRITICAL: Check payment hold prerequisites
      if (!usePaymentHold) {
        console.warn('PaymentModal - usePaymentHold is false, payment will be immediate');
      }
      if (!bookingId) {
        console.error('PaymentModal - Missing bookingId:', bookingId);
      }
      if (!userId) {
        console.error('PaymentModal - Missing userId:', userId);
      }

      if (usePaymentHold && bookingId && userId) {
        console.log('PaymentModal - Creating payment hold for booking:', bookingId);
        
        // Use payment hold system for ride booking
        const holdData: PaymentHoldData = {
          amount: amount,
          paymentMethod: paymentMethodData,
          bookingId: bookingId,
          userId: userId
        };

        console.log('PaymentModal - Payment hold data:', holdData);

        const result = await PaymentHoldService.createPaymentHold(holdData);
        
        console.log('PaymentModal - Payment hold result:', result);
        
        if (result.success) {
          console.log('PaymentModal - Payment hold created successfully');
          
          // Save payment method if requested (after successful authorization)
          if (useNewPaymentMethod) {
            console.log('PaymentModal - Saving new payment method');
            await saveNewPaymentMethod(paymentMethodData);
          }
          
          // Payment authorization successful
          const paymentData = {
            paymentIntentId: result.authorizationId,
            paymentId: result.paymentId,
            transactionId: null, // No transaction yet, only authorization
            paymentMethod: selectedPaymentMethod ? selectedPaymentMethod.type : paymentMethod,
            paymentMethodId: paymentMethodData.id,
            amount: amount,
            currency: 'USD',
            status: 'authorized', // Payment is held, not captured
            expiresAt: result.expiresAt,
            isHold: true
          };
          
          console.log('PaymentModal - Payment success data:', paymentData);
          onSuccess(paymentData);
        } else {
          console.error('PaymentModal - Payment hold creation failed:', result.error);
          throw new Error(result.error || 'Payment authorization failed');
        }
      } else {
        console.log('PaymentModal - Using immediate payment mode (not payment hold)');
        console.log('PaymentModal - Conditions check:', { usePaymentHold, bookingId, userId });
        
        // Original immediate payment processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Save payment method if requested (after successful payment)
        if (useNewPaymentMethod) {
          await saveNewPaymentMethod(paymentMethodData);
        }
        
        const paymentData = {
          paymentIntentId: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          transactionId: `txn_${Date.now()}`,
          paymentMethod: selectedPaymentMethod ? selectedPaymentMethod.type : paymentMethod,
          paymentMethodId: paymentMethodData.id,
          amount: amount,
          currency: 'USD',
          status: 'succeeded',
          isHold: false
        };
        
        onSuccess(paymentData);
      }
    } catch (error) {
      console.error('PaymentModal - Payment failed:', error);
      console.log('PaymentModal - Payment context:', { usePaymentHold, bookingId, userId, amount });
      alert(error instanceof Error ? error.message : 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
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

  const formatExpiry = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  // Helper functions for payment method display
  const getPaymentMethodIcon = (type: string) => {
    switch (type) {
      case 'credit_card':
      case 'debit_card':
        return <CreditCard size={20} className="text-gray-600" />;
      case 'paypal':
        return <Wallet size={20} className="text-blue-600" />;
      case 'apple_pay':
        return <Apple size={20} className="text-gray-800" />;
      case 'google_pay':
        return <Smartphone size={20} className="text-green-600" />;
      default:
        return <CreditCard size={20} className="text-gray-600" />;
    }
  };

  const formatPaymentMethodDisplay = (method: PaymentMethod) => {
    switch (method.type) {
      case 'credit_card':
      case 'debit_card':
        return {
          label: `•••• •••• •••• ${method.last_four}`,
          subtitle: `Expires ${method.expiry_month}/${method.expiry_year}`
        };
      case 'paypal':
        return {
          label: method.email || 'PayPal Account',
          subtitle: 'PayPal'
        };
      case 'apple_pay':
        return {
          label: 'Apple Pay',
          subtitle: 'Touch ID / Face ID'
        };
      case 'google_pay':
        return {
          label: 'Google Pay',
          subtitle: 'Quick checkout'
        };
      default:
        return {
          label: 'Payment Method',
          subtitle: ''
        };
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Complete Payment</h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Payment Summary */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Payment Summary</h3>
            <div className="space-y-2 text-sm">
              {usePaymentHold && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <div className="flex items-center space-x-2 mb-2">
                    <Lock size={16} className="text-blue-600" />
                    <span className="font-medium text-blue-900">Payment Authorization</span>
                  </div>
                  <p className="text-blue-700 text-sm">
                    Your payment will be authorized but not charged until the driver accepts your ride request. 
                    If declined or no response within 12 hours, you'll get a full refund automatically.
                  </p>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-2 mt-3">
                <span className="font-semibold text-gray-900">
                  {usePaymentHold ? 'Authorization Amount:' : 'Total Amount:'}
                </span>
                <span className="font-bold text-gray-900">${amount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment Method Selection */}
          {loadingPaymentMethods ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600">Loading payment methods...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Select Payment Method</h3>
              
              {/* Saved Payment Methods */}
              {savedPaymentMethods.length > 0 && !useNewPaymentMethod && (
                <div className="space-y-3">
                  {savedPaymentMethods.map((method) => (
                    <div
                      key={method.id}
                      onClick={() => setSelectedPaymentMethod(method)}
                      className={`p-4 border rounded-xl cursor-pointer transition-all ${
                        selectedPaymentMethod?.id === method.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getPaymentMethodIcon(method.type)}
                          <div>
                            <div className="font-medium text-gray-900">
                              {formatPaymentMethodDisplay(method).label}
                            </div>
                            <div className="text-sm text-gray-500">
                              {formatPaymentMethodDisplay(method).subtitle}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {method.is_default && (
                            <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                              Default
                            </span>
                          )}
                          {selectedPaymentMethod?.id === method.id && (
                            <Check size={20} className="text-blue-600" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Add New Payment Method Option */}
                  <button
                    onClick={() => setUseNewPaymentMethod(true)}
                    className="w-full p-4 border border-dashed border-gray-300 rounded-xl hover:border-gray-400 transition-colors flex items-center justify-center space-x-2 text-gray-600"
                  >
                    <Plus size={20} />
                    <span>Add New Payment Method</span>
                  </button>
                </div>
              )}

              {/* New Payment Method Form */}
              {(useNewPaymentMethod || savedPaymentMethods.length === 0) && (
                <div className="space-y-4">
                  {savedPaymentMethods.length > 0 && (
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-900">Add New Payment Method</h4>
                      <button
                        onClick={() => {
                          setUseNewPaymentMethod(false);
                          if (savedPaymentMethods.length > 0) {
                            setSelectedPaymentMethod(savedPaymentMethods[0]);
                          }
                        }}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        Use Saved Method
                      </button>
                    </div>
                  )}
                  
                  {/* Payment Method Type Selection */}
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setPaymentMethod('card')}
                        className={`p-3 border rounded-lg flex items-center justify-center space-x-2 transition-colors ${
                          paymentMethod === 'card'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <CreditCard size={16} />
                        <span className="text-sm font-medium">Card</span>
                      </button>
                      <button
                        onClick={() => setPaymentMethod('paypal')}
                        className={`p-3 border rounded-lg flex items-center justify-center space-x-2 transition-colors ${
                          paymentMethod === 'paypal'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Wallet size={16} />
                        <span className="text-sm font-medium">PayPal</span>
                      </button>
                    </div>
                    
                    {paymentMethod === 'card' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Card Number
                          </label>
                          <input
                            type="text"
                            value={cardData.number}
                            onChange={(e) => setCardData({ ...cardData, number: formatCardNumber(e.target.value) })}
                            placeholder="1234 5678 9012 3456"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            maxLength={19}
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Expiry
                            </label>
                            <input
                              type="text"
                              value={cardData.expiry}
                              onChange={(e) => setCardData({ ...cardData, expiry: formatExpiry(e.target.value) })}
                              placeholder="MM/YY"
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              maxLength={5}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              CVC
                            </label>
                            <input
                              type="text"
                              value={cardData.cvc}
                              onChange={(e) => setCardData({ ...cardData, cvc: e.target.value.replace(/\D/g, '') })}
                              placeholder="123"
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              maxLength={4}
                            />
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Cardholder Name
                          </label>
                          <input
                            type="text"
                            value={cardData.name}
                            onChange={(e) => setCardData({ ...cardData, name: e.target.value })}
                            placeholder="John Doe"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        
                        {/* Save Payment Method Checkbox */}
                        <div className="flex items-center space-x-3 pt-2">
                          <input
                            id="save-payment-method"
                            type="checkbox"
                            checked={savePaymentMethod}
                            onChange={(e) => setSavePaymentMethod(e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor="save-payment-method" className="text-sm text-gray-700">
                            Save this payment method for future use
                          </label>
                        </div>
                      </div>
                    )}
                    
                    {paymentMethod === 'paypal' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="text-center mb-4">
                          <Wallet size={32} className="text-blue-600 mx-auto mb-2" />
                          <p className="text-blue-800 font-medium">PayPal</p>
                          <p className="text-blue-600 text-sm">
                            {usePaymentHold 
                              ? "PayPal will authorize this payment. You'll only be charged if the driver accepts your ride."
                              : "You'll be redirected to PayPal to complete payment"
                            }
                          </p>
                        </div>
                        <PayPalButton
                          amount={amount}
                          currency="CAD"
                          intent={usePaymentHold ? 'authorize' : 'capture'}
                          bookingId={bookingId}
                          userId={userId}
                          onSuccess={(paymentData) => {
                            // Save payment method if this is the first PayPal transaction
                            if (savedPaymentMethods.filter(m => m.type === 'paypal').length === 0) {
                              const newPayPalMethod = {
                                user_id: userId,
                                type: 'paypal' as const,
                                email: 'PayPal Account',
                                is_default: savedPaymentMethods.length === 0,
                                is_active: true
                              };
                              
                              supabase
                                .from('payment_methods')
                                .insert([newPayPalMethod])
                                .then(() => console.log('PayPal method saved'))
                                .catch(err => console.error('Error saving PayPal method:', err));
                            }
                            
                            onSuccess(paymentData);
                          }}
                          onError={(error) => {
                            console.error('PayPal payment error:', error);
                            alert('PayPal payment failed. Please try again.');
                          }}
                          onCancel={() => {
                            console.log('PayPal payment cancelled');
                          }}
                          style={{
                            layout: 'vertical',
                            color: 'gold',
                            shape: 'rect',
                            label: usePaymentHold ? 'pay' : 'pay',
                            tagline: false,
                            height: 45
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons - Hide for PayPal since it has its own button */}
          {paymentMethod !== 'paypal' && (
            <div className="flex space-x-3 pt-4">
              <button
                onClick={onCancel}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-xl font-medium transition-colors"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={processing || loadingPaymentMethods || (!selectedPaymentMethod && !useNewPaymentMethod)}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-3 px-4 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Processing...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <Lock size={16} />
                    <span>
                      {usePaymentHold ? `Authorize $${amount.toFixed(2)}` : `Pay $${amount.toFixed(2)}`}
                    </span>
                  </div>
                )}
              </button>
            </div>
          )}
          
          {/* PayPal only shows Cancel button */}
          {paymentMethod === 'paypal' && (
            <div className="flex justify-center pt-4">
              <button
                onClick={onCancel}
                className="px-8 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-medium transition-colors"
                disabled={processing}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;