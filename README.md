# OnGoPool - Complete Carpool Application

OnGoPool is a modern, full-stack carpool application built with React, TypeScript, and Supabase. The app enables users to find and share rides with real-time chat, payment processing, intelligent route mapping, comprehensive trip management, and user profiles.

## Features

- **User Authentication**: Complete signup/login with Supabase Auth
- **Ride Management**: Post rides, find rides, book rides with real-time updates
- **Real-time Chat**: Driver-passenger communication with instant messaging
- **Dual Payment System**: Both Stripe and PayPal integration with payment holds
- **Intelligent Routing**: Multi-service routing with OpenStreetMap and enhanced ETA calculation
- **Trip Dashboard**: Complete driver trip management with live ETA tracking
- **User Profiles**: License verification, earnings tracking, and payment method management
- **Rating System**: Complete review system for drivers and passengers
- **Real-time Notifications**: Browser push notifications for all events

## Tech Stack

- **Frontend**: React 18.3.1 + TypeScript 5.8.3
- **Build System**: Vite 7.0.0
- **Styling**: Tailwind CSS 3.4.17
- **Backend**: Supabase (Database + Real-time + Auth + Storage)
- **Payments**: Stripe + PayPal with payment hold system
- **Maps**: OpenStreetMap with Leaflet
- **Routing**: OSRM + GraphHopper APIs

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install --legacy-peer-deps
   ```

2. **Build the project**:
   ```bash
   npm run build
   ```

3. **Environment Setup**:
   - Update `.env` with your API keys
   - Configure Supabase database connection
   - Set up Stripe and PayPal credentials

## Deployment

This project is configured for Vercel deployment with:
- Serverless functions in `/api` directory
- Static site generation from React build
- Environment variable configuration
- Database integration with Supabase

### Deploy to Vercel

1. Upload this `ongopool` folder to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy - the app will automatically build and deploy

## Database

The app uses Supabase with complete schema including:
- User profiles and authentication
- Ride management with segments
- Real-time chat system
- Payment processing tables
- Earnings and payout tracking
- Rating and review system

## Live Features

- **Real-time chat** with instant message delivery
- **Live ETA tracking** for active trips
- **Push notifications** for all events
- **Real-time ride updates** and status changes
- **Live payment processing** with both Stripe and PayPal

## Security

- Row Level Security (RLS) on all database tables
- Secure payment processing with PCI compliance
- Protected routes and authentication
- File upload security for profile pictures and documents

---

**OnGoPool** - Complete carpool solution ready for production deployment.