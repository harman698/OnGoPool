# OnGoPool Backend API

This directory contains the backend API for OnGoPool's payment processing system, deployed as Vercel serverless functions.

## API Structure

### Stripe Payment Processing
- **Payment Intents**: `/api/stripe/payment-intents`
- **Customer Management**: `/api/stripe/customers`
- **Payment Methods**: `/api/stripe/payment-methods`
- **Setup Intents**: `/api/stripe/setup-intents`
- **Webhooks**: `/api/stripe/webhooks`

## Deployment

The API is configured for deployment on Vercel with the following features:

### Environment Variables Required
```
STRIPE_SECRET_KEY=sk_test_... (or sk_live_... for production)
STRIPE_PUBLISHABLE_KEY=pk_test_... (or pk_live_... for production)
STRIPE_WEBHOOK_SECRET=whsec_... (from Stripe webhook configuration)
```

### Deployment Commands
```bash
# Build the functions
npm run build:functions

# Deploy to Vercel
npm run deploy:functions
```

## API Endpoints

### Payment Intents
- `POST /api/stripe/payment-intents` - Create payment intent
- `POST /api/stripe/payment-intents/capture` - Capture authorized payment
- `POST /api/stripe/payment-intents/cancel` - Cancel payment intent
- `GET /api/stripe/payment-intents/:id` - Get payment intent status

### Customers
- `POST /api/stripe/customers` - Create customer
- `GET /api/stripe/customers/:id` - Get customer
- `PUT /api/stripe/customers/:id` - Update customer
- `DELETE /api/stripe/customers/:id` - Delete customer

### Payment Methods
- `POST /api/stripe/customers/:id/payment-methods` - Attach payment method
- `GET /api/stripe/customers/:id/payment-methods` - List customer payment methods
- `GET /api/stripe/payment-methods/:id` - Get payment method
- `DELETE /api/stripe/payment-methods/:id` - Detach payment method

### Setup Intents
- `POST /api/stripe/setup-intents` - Create setup intent for saving payment methods

### Refunds
- `POST /api/stripe/refunds` - Create refund

### Webhooks
- `POST /api/stripe/webhooks` - Handle Stripe webhook events

## Features

### Security
- CORS enabled for frontend integration
- Webhook signature verification
- Input validation and error handling

### Payment Hold System
- Authorization holds for ride requests
- Manual capture when driver accepts
- Automatic cancellation on rejection/timeout

### Error Handling
- Comprehensive error logging
- Structured error responses
- Graceful failure handling

## Integration

The frontend automatically detects when the backend API is available and switches from mock payments to real Stripe processing. When deployed, payments will appear in your Stripe dashboard.

## Webhook Configuration

To receive real-time payment updates, configure a webhook endpoint in your Stripe dashboard:
- Endpoint URL: `https://your-domain.com/api/stripe/webhooks`
- Events to send: `payment_intent.*`, `customer.*`, `payment_method.*`, `setup_intent.*`, `charge.*`