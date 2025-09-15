/**
 * Stripe Customer Management API
 * Vercel serverless function for customer creation, payment methods, and subscription management
 */

import Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Initialize Stripe with secret key from environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// Request interfaces
interface CreateCustomerRequest {
  email: string;
  name?: string;
  phone?: string;
  user_id: string;
  metadata?: Record<string, string>;
}

interface AttachPaymentMethodRequest {
  customer_id: string;
  payment_method_id: string;
  set_as_default?: boolean;
}

interface DetachPaymentMethodRequest {
  payment_method_id: string;
}

interface UpdateCustomerRequest {
  customer_id: string;
  email?: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, string>;
}

// Response interfaces
interface CustomerResponse {
  success: boolean;
  customer?: Stripe.Customer;
  error?: string;
}

interface PaymentMethodResponse {
  success: boolean;
  payment_method?: Stripe.PaymentMethod;
  payment_methods?: Stripe.PaymentMethod[];
  error?: string;
}

/**
 * Create Stripe Customer
 * POST /api/stripe/customers
 */
export async function createCustomer(request: CreateCustomerRequest): Promise<CustomerResponse> {
  try {
    // Input validation
    if (!request.email || !request.user_id) {
      return {
        success: false,
        error: 'Email and user ID are required'
      };
    }

    // Check if customer already exists
    const existingCustomers = await stripe.customers.list({
      email: request.email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      const existingCustomer = existingCustomers.data[0];
      
      // Update existing customer with new metadata if needed
      if (request.user_id && existingCustomer.metadata.user_id !== request.user_id) {
        const updatedCustomer = await stripe.customers.update(existingCustomer.id, {
          metadata: {
            ...existingCustomer.metadata,
            user_id: request.user_id,
            updated_at: new Date().toISOString()
          }
        });
        
        return {
          success: true,
          customer: updatedCustomer
        };
      }

      return {
        success: true,
        customer: existingCustomer
      };
    }

    // Create new customer
    const customerParams: Stripe.CustomerCreateParams = {
      email: request.email,
      name: request.name,
      phone: request.phone,
      metadata: {
        user_id: request.user_id,
        app: 'OnGoPool',
        created_at: new Date().toISOString(),
        ...request.metadata
      }
    };

    const customer = await stripe.customers.create(customerParams);

    return {
      success: true,
      customer: customer
    };

  } catch (error) {
    console.error('Error creating customer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create customer'
    };
  }
}

/**
 * Get Customer by ID or Email
 * GET /api/stripe/customers/:id
 */
export async function getCustomer(customerIdOrEmail: string): Promise<CustomerResponse> {
  try {
    let customer: Stripe.Customer;

    // Check if the parameter is an email or customer ID
    if (customerIdOrEmail.includes('@')) {
      // Search by email
      const customers = await stripe.customers.list({
        email: customerIdOrEmail,
        limit: 1
      });

      if (customers.data.length === 0) {
        return {
          success: false,
          error: 'Customer not found'
        };
      }

      customer = customers.data[0];
    } else {
      // Get by customer ID
      customer = await stripe.customers.retrieve(customerIdOrEmail) as Stripe.Customer;
    }

    return {
      success: true,
      customer: customer
    };

  } catch (error) {
    console.error('Error retrieving customer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve customer'
    };
  }
}

/**
 * Update Customer Information
 * PUT /api/stripe/customers/:id
 */
export async function updateCustomer(request: UpdateCustomerRequest): Promise<CustomerResponse> {
  try {
    if (!request.customer_id) {
      return {
        success: false,
        error: 'Customer ID is required'
      };
    }

    const updateParams: Stripe.CustomerUpdateParams = {};

    if (request.email) updateParams.email = request.email;
    if (request.name) updateParams.name = request.name;
    if (request.phone) updateParams.phone = request.phone;
    
    if (request.metadata) {
      updateParams.metadata = {
        ...request.metadata,
        updated_at: new Date().toISOString()
      };
    }

    const customer = await stripe.customers.update(request.customer_id, updateParams);

    return {
      success: true,
      customer: customer
    };

  } catch (error) {
    console.error('Error updating customer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update customer'
    };
  }
}

/**
 * Attach Payment Method to Customer
 * POST /api/stripe/customers/:id/payment-methods
 */
export async function attachPaymentMethod(request: AttachPaymentMethodRequest): Promise<PaymentMethodResponse> {
  try {
    if (!request.customer_id || !request.payment_method_id) {
      return {
        success: false,
        error: 'Customer ID and payment method ID are required'
      };
    }

    // Attach payment method to customer
    const paymentMethod = await stripe.paymentMethods.attach(request.payment_method_id, {
      customer: request.customer_id
    });

    // Set as default payment method if requested
    if (request.set_as_default) {
      await stripe.customers.update(request.customer_id, {
        invoice_settings: {
          default_payment_method: request.payment_method_id
        }
      });
    }

    return {
      success: true,
      payment_method: paymentMethod
    };

  } catch (error) {
    console.error('Error attaching payment method:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to attach payment method'
    };
  }
}

/**
 * Detach Payment Method from Customer
 * DELETE /api/stripe/payment-methods/:id
 */
export async function detachPaymentMethod(request: DetachPaymentMethodRequest): Promise<PaymentMethodResponse> {
  try {
    if (!request.payment_method_id) {
      return {
        success: false,
        error: 'Payment method ID is required'
      };
    }

    const paymentMethod = await stripe.paymentMethods.detach(request.payment_method_id);

    return {
      success: true,
      payment_method: paymentMethod
    };

  } catch (error) {
    console.error('Error detaching payment method:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detach payment method'
    };
  }
}

/**
 * List Customer Payment Methods
 * GET /api/stripe/customers/:id/payment-methods
 */
export async function listCustomerPaymentMethods(
  customerId: string,
  type: Stripe.PaymentMethodListParams.Type = 'card'
): Promise<PaymentMethodResponse> {
  try {
    if (!customerId) {
      return {
        success: false,
        error: 'Customer ID is required'
      };
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: type
    });

    return {
      success: true,
      payment_methods: paymentMethods.data
    };

  } catch (error) {
    console.error('Error listing payment methods:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list payment methods'
    };
  }
}

/**
 * Get Payment Method Details
 * GET /api/stripe/payment-methods/:id
 */
export async function getPaymentMethod(paymentMethodId: string): Promise<PaymentMethodResponse> {
  try {
    if (!paymentMethodId) {
      return {
        success: false,
        error: 'Payment method ID is required'
      };
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    return {
      success: true,
      payment_method: paymentMethod
    };

  } catch (error) {
    console.error('Error retrieving payment method:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve payment method'
    };
  }
}

/**
 * Create Setup Intent for Saving Payment Methods
 * POST /api/stripe/setup-intents
 */
export async function createSetupIntent(
  customerId: string,
  paymentMethodTypes: string[] = ['card']
): Promise<{ success: boolean; setup_intent?: Stripe.SetupIntent; client_secret?: string; error?: string }> {
  try {
    if (!customerId) {
      return {
        success: false,
        error: 'Customer ID is required'
      };
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: paymentMethodTypes,
      usage: 'off_session', // For future payments
      metadata: {
        created_at: new Date().toISOString(),
        app: 'OnGoPool'
      }
    });

    return {
      success: true,
      setup_intent: setupIntent,
      client_secret: setupIntent.client_secret!
    };

  } catch (error) {
    console.error('Error creating setup intent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create setup intent'
    };
  }
}

/**
 * Delete Customer
 * DELETE /api/stripe/customers/:id
 */
export async function deleteCustomer(customerId: string): Promise<CustomerResponse> {
  try {
    if (!customerId) {
      return {
        success: false,
        error: 'Customer ID is required'
      };
    }

    const deletedCustomer = await stripe.customers.del(customerId);

    return {
      success: true,
      customer: deletedCustomer as Stripe.Customer
    };

  } catch (error) {
    console.error('Error deleting customer:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete customer'
    };
  }
}

/**
 * Main Vercel serverless function handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { method, url } = req;

  try {
    if (method === 'POST' && url === '/api/stripe/customers') {
      const result = await createCustomer(req.body);
      return res.status(result.success ? 200 : 400).json({
        success: result.success,
        data: result.success ? { customer: result.customer } : undefined,
        error: result.error,
        timestamp: new Date().toISOString(),
        statusCode: result.success ? 200 : 400
      });
    }

    if (method === 'POST' && url === '/api/stripe/setup-intents') {
      const { customer_id, payment_method_types } = req.body;
      const result = await createSetupIntent(customer_id, payment_method_types);
      return res.status(result.success ? 200 : 400).json({
        success: result.success,
        data: result.success ? { setup_intent: result.setup_intent, client_secret: result.client_secret } : undefined,
        error: result.error,
        timestamp: new Date().toISOString(),
        statusCode: result.success ? 200 : 400
      });
    }

    // Handle customer-specific routes
    if (url?.startsWith('/api/stripe/customers/')) {
      const pathParts = url.split('/');
      const customerId = pathParts[4];

      if (method === 'GET' && pathParts.length === 5) {
        const result = await getCustomer(customerId);
        return res.status(result.success ? 200 : 400).json({
          success: result.success,
          data: result.success ? { customer: result.customer } : undefined,
          error: result.error,
          timestamp: new Date().toISOString(),
          statusCode: result.success ? 200 : 400
        });
      }

      if (method === 'PUT' && pathParts.length === 5) {
        const result = await updateCustomer({ customer_id: customerId, ...req.body });
        return res.status(result.success ? 200 : 400).json({
          success: result.success,
          data: result.success ? { customer: result.customer } : undefined,
          error: result.error,
          timestamp: new Date().toISOString(),
          statusCode: result.success ? 200 : 400
        });
      }

      if (method === 'DELETE' && pathParts.length === 5) {
        const result = await deleteCustomer(customerId);
        return res.status(result.success ? 200 : 400).json({
          success: result.success,
          data: result.success ? { customer: result.customer } : undefined,
          error: result.error,
          timestamp: new Date().toISOString(),
          statusCode: result.success ? 200 : 400
        });
      }

      if (method === 'POST' && pathParts[5] === 'payment-methods') {
        const result = await attachPaymentMethod({ customer_id: customerId, ...req.body });
        return res.status(result.success ? 200 : 400).json({
          success: result.success,
          data: result.success ? { payment_method: result.payment_method } : undefined,
          error: result.error,
          timestamp: new Date().toISOString(),
          statusCode: result.success ? 200 : 400
        });
      }

      if (method === 'GET' && pathParts[5] === 'payment-methods') {
        const type = (req.query.type as string) || 'card';
        const result = await listCustomerPaymentMethods(customerId, type as any);
        return res.status(result.success ? 200 : 400).json({
          success: result.success,
          data: result.success ? { payment_methods: result.payment_methods } : undefined,
          error: result.error,
          timestamp: new Date().toISOString(),
          statusCode: result.success ? 200 : 400
        });
      }
    }

    // Handle payment method routes
    if (url?.startsWith('/api/stripe/payment-methods/')) {
      const pathParts = url.split('/');
      const paymentMethodId = pathParts[4];

      if (method === 'GET') {
        const result = await getPaymentMethod(paymentMethodId);
        return res.status(result.success ? 200 : 400).json({
          success: result.success,
          data: result.success ? { payment_method: result.payment_method } : undefined,
          error: result.error,
          timestamp: new Date().toISOString(),
          statusCode: result.success ? 200 : 400
        });
      }

      if (method === 'DELETE') {
        const result = await detachPaymentMethod({ payment_method_id: paymentMethodId });
        return res.status(result.success ? 200 : 400).json({
          success: result.success,
          data: result.success ? { payment_method: result.payment_method } : undefined,
          error: result.error,
          timestamp: new Date().toISOString(),
          statusCode: result.success ? 200 : 400
        });
      }
    }

    return res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      timestamp: new Date().toISOString(),
      statusCode: 404
    });

  } catch (error) {
    console.error('Stripe Customer API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
      statusCode: 500
    });
  }
}

// Export types for client use
export type {
  CreateCustomerRequest,
  AttachPaymentMethodRequest,
  DetachPaymentMethodRequest,
  UpdateCustomerRequest,
  CustomerResponse,
  PaymentMethodResponse
};