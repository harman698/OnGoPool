import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { CreditCard, Lock, Loader2 } from 'lucide-react';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

interface StripePaymentFormProps {
  clientSecret: string;
  onSuccess: (paymentIntent: any) => void;
  onError: (error: string) => void;
  processing: boolean;
  setProcessing: (processing: boolean) => void;
}

const StripePaymentForm: React.FC<StripePaymentFormProps> = ({
  clientSecret,
  onSuccess,
  onError,
  processing,
  setProcessing
}) => {
  const [cardData, setCardData] = useState({
    number: '',
    expiry: '',
    cvc: '',
    name: '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validateCard = () => {
    const newErrors: { [key: string]: string } = {};

    // Validate card number (basic validation)
    if (!cardData.number.replace(/\s/g, '')) {
      newErrors.number = 'Card number is required';
    } else if (cardData.number.replace(/\s/g, '').length < 13) {
      newErrors.number = 'Card number must be at least 13 digits';
    }

    // Validate expiry
    if (!cardData.expiry) {
      newErrors.expiry = 'Expiry date is required';
    } else {
      const [month, year] = cardData.expiry.split('/');
      const currentYear = new Date().getFullYear() % 100;
      const currentMonth = new Date().getMonth() + 1;
      
      if (!month || !year || month.length !== 2 || year.length !== 2) {
        newErrors.expiry = 'Invalid expiry format (MM/YY)';
      } else {
        const expMonth = parseInt(month);
        const expYear = parseInt(year);
        
        if (expMonth < 1 || expMonth > 12) {
          newErrors.expiry = 'Invalid month';
        } else if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
          newErrors.expiry = 'Card has expired';
        }
      }
    }

    // Validate CVC
    if (!cardData.cvc) {
      newErrors.cvc = 'CVC is required';
    } else if (cardData.cvc.length < 3) {
      newErrors.cvc = 'CVC must be at least 3 digits';
    }

    // Validate name
    if (!cardData.name.trim()) {
      newErrors.name = 'Cardholder name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateCard()) {
      return;
    }

    setProcessing(true);

    try {
      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error('Stripe not loaded');
      }

      // Create a payment method with the card data
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: {
          number: cardData.number.replace(/\s/g, ''),
          exp_month: parseInt(cardData.expiry.split('/')[0]),
          exp_year: parseInt(`20${cardData.expiry.split('/')[1]}`),
          cvc: cardData.cvc,
        },
        billing_details: {
          name: cardData.name,
        },
      });

      if (pmError) {
        throw new Error(pmError.message);
      }

      // Confirm the payment intent with the payment method
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: paymentMethod.id,
      });

      if (confirmError) {
        throw new Error(confirmError.message);
      }

      if (paymentIntent.status === 'requires_capture') {
        // Payment authorized successfully (for payment holds)
        onSuccess(paymentIntent);
      } else if (paymentIntent.status === 'succeeded') {
        // Payment completed successfully (for immediate payments)
        onSuccess(paymentIntent);
      } else {
        throw new Error(`Unexpected payment status: ${paymentIntent.status}`);
      }

    } catch (error: any) {
      console.error('Payment failed:', error);
      onError(error.message || 'Payment failed. Please try again.');
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
      return `${v.slice(0, 2)}/${v.slice(2, 4)}`;
    }
    return v;
  };

  const formatCVC = (value: string) => {
    return value.replace(/\D/g, '').slice(0, 4);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Card Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <CreditCard className="w-4 h-4 inline mr-2" />
          Card Number
        </label>
        <input
          type="text"
          value={cardData.number}
          onChange={(e) => setCardData({ ...cardData, number: formatCardNumber(e.target.value) })}
          placeholder="1234 5678 9012 3456"
          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            errors.number ? 'border-red-500' : 'border-gray-300'
          }`}
          maxLength={19}
        />
        {errors.number && (
          <p className="text-red-500 text-sm mt-1">{errors.number}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Expiry Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Expiry Date
          </label>
          <input
            type="text"
            value={cardData.expiry}
            onChange={(e) => setCardData({ ...cardData, expiry: formatExpiry(e.target.value) })}
            placeholder="MM/YY"
            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.expiry ? 'border-red-500' : 'border-gray-300'
            }`}
            maxLength={5}
          />
          {errors.expiry && (
            <p className="text-red-500 text-sm mt-1">{errors.expiry}</p>
          )}
        </div>

        {/* CVC */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            CVC
          </label>
          <input
            type="text"
            value={cardData.cvc}
            onChange={(e) => setCardData({ ...cardData, cvc: formatCVC(e.target.value) })}
            placeholder="123"
            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.cvc ? 'border-red-500' : 'border-gray-300'
            }`}
            maxLength={4}
          />
          {errors.cvc && (
            <p className="text-red-500 text-sm mt-1">{errors.cvc}</p>
          )}
        </div>
      </div>

      {/* Cardholder Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Cardholder Name
        </label>
        <input
          type="text"
          value={cardData.name}
          onChange={(e) => setCardData({ ...cardData, name: e.target.value })}
          placeholder="John Doe"
          className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            errors.name ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.name && (
          <p className="text-red-500 text-sm mt-1">{errors.name}</p>
        )}
      </div>

      {/* Security Notice */}
      <div className="flex items-center text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
        <Lock className="w-4 h-4 mr-2" />
        <span>Your payment information is encrypted and secure</span>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={processing}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
      >
        {processing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Processing...
          </>
        ) : (
          'Authorize Payment'
        )}
      </button>
    </form>
  );
};

export default StripePaymentForm;