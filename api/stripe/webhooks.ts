/**
 * Stripe Webhooks API Endpoint
 * Vercel serverless function for handling Stripe webhook events
 */

import Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Initialize Stripe with secret key from environment
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Handle Payment Intent Events
 */
async function handlePaymentIntentEvent(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  
  console.log(`PaymentIntent ${event.type}:`, paymentIntent.id);
  
  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log(`Payment succeeded: ${paymentIntent.id}`);
      // Here you would typically update your database
      // with the successful payment information
      break;
      
    case 'payment_intent.payment_failed':
      console.log(`Payment failed: ${paymentIntent.id}`);
      // Handle failed payment
      break;
      
    case 'payment_intent.canceled':
      console.log(`Payment canceled: ${paymentIntent.id}`);
      // Handle canceled payment
      break;
      
    case 'payment_intent.requires_action':
      console.log(`Payment requires action: ${paymentIntent.id}`);
      // Handle payment that requires additional action
      break;
  }
}

/**
 * Handle Customer Events
 */
async function handleCustomerEvent(event: Stripe.Event) {
  const customer = event.data.object as Stripe.Customer;
  
  console.log(`Customer ${event.type}:`, customer.id);
  
  switch (event.type) {
    case 'customer.created':
      console.log(`New customer created: ${customer.id}`);
      break;
      
    case 'customer.updated':
      console.log(`Customer updated: ${customer.id}`);
      break;
      
    case 'customer.deleted':
      console.log(`Customer deleted: ${customer.id}`);
      break;
  }
}

/**
 * Handle Payment Method Events
 */
async function handlePaymentMethodEvent(event: Stripe.Event) {
  const paymentMethod = event.data.object as Stripe.PaymentMethod;
  
  console.log(`PaymentMethod ${event.type}:`, paymentMethod.id);
  
  switch (event.type) {
    case 'payment_method.attached':
      console.log(`Payment method attached: ${paymentMethod.id}`);
      break;
      
    case 'payment_method.detached':
      console.log(`Payment method detached: ${paymentMethod.id}`);
      break;
  }
}

/**
 * Handle Setup Intent Events
 */
async function handleSetupIntentEvent(event: Stripe.Event) {
  const setupIntent = event.data.object as Stripe.SetupIntent;
  
  console.log(`SetupIntent ${event.type}:`, setupIntent.id);
  
  switch (event.type) {
    case 'setup_intent.succeeded':
      console.log(`Setup intent succeeded: ${setupIntent.id}`);
      // Payment method was successfully set up for future use
      break;
      
    case 'setup_intent.setup_failed':
      console.log(`Setup intent failed: ${setupIntent.id}`);
      break;
  }
}

/**
 * Handle Charge Events
 */
async function handleChargeEvent(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  
  console.log(`Charge ${event.type}:`, charge.id);
  
  switch (event.type) {
    case 'charge.succeeded':
      console.log(`Charge succeeded: ${charge.id}`);
      break;
      
    case 'charge.failed':
      console.log(`Charge failed: ${charge.id}`);
      break;
      
    case 'charge.captured':
      console.log(`Charge captured: ${charge.id}`);
      break;
  }
}

/**
 * Main Vercel serverless function handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      JSON.stringify(req.body),
      sig,
      endpointSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    // Handle the event
    switch (event.type) {
      // Payment Intent events
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
      case 'payment_intent.requires_action':
        await handlePaymentIntentEvent(event);
        break;

      // Customer events
      case 'customer.created':
      case 'customer.updated':
      case 'customer.deleted':
        await handleCustomerEvent(event);
        break;

      // Payment Method events
      case 'payment_method.attached':
      case 'payment_method.detached':
        await handlePaymentMethodEvent(event);
        break;

      // Setup Intent events
      case 'setup_intent.succeeded':
      case 'setup_intent.setup_failed':
        await handleSetupIntentEvent(event);
        break;

      // Charge events
      case 'charge.succeeded':
      case 'charge.failed':
      case 'charge.captured':
        await handleChargeEvent(event);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}