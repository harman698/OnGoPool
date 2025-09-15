# OnGoPool Deployment Guide

## Vercel Deployment Instructions

### 1. Pre-deployment Setup

1. **Build the project locally** to ensure everything works:
   ```bash
   npm install --legacy-peer-deps
   npm run build
   ```

2. **Verify all files are present**:
   - Source code in `src/`
   - API functions in `api/stripe/`
   - Configuration files (vercel.json, package.json, etc.)
   - Environment variables in `.env` (do not commit this file)

### 2. Vercel Deployment Steps

1. **Upload to Vercel**:
   - Zip the entire `ongopool` folder
   - Upload to Vercel dashboard or connect via Git

2. **Configure Environment Variables** in Vercel dashboard:
   ```
   VITE_SUPABASE_URL=https://jepvxmejoggfjksqtrgh.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplcHZ4bWVqb2dnZmprc3F0cmdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5Mzc1ODIsImV4cCI6MjA3MjUxMzU4Mn0.xxdc03qdzdxocvUSlJbStyBkB_HFviCqyevI1cO-_1s
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51S5wub3Cz2UGWP4DlGSffOgjNoiuVm6OJAQsaO8EJ6ek5lEUQfUjqiqE4JDaDlStaNPJ0b6LUboX4jtLJKtsVcEz00cfGGSU4D
   STRIPE_SECRET_KEY=sk_test_51S5wub3Cz2UGWP4D3xTH5WBpqn5l4Irmb4tM8TTnWUcyW98J6hzirMm1ul1qb2zlwjDxhQuoZZxncOgptAKsyOBf00Rd9WLvyQ
   VITE_PAYPAL_CLIENT_ID=AbGPQ42SxKv2Ee4epIpzj9ExeDl89H0AATL6i1cs1SNrZ6-6DFjJK6kJwykQxuNiYk1Ih5s-fFNV3Ha1
   PAYPAL_CLIENT_SECRET=ENAmHMMr6_7sg7CCXrDFX343ExwXWUCfmMqQU88miymiid0OlkD_IlLFylCtLEvSBu7yZzH4wX9f0tVg
   VITE_PAYPAL_SANDBOX_MODE=false
   VITE_BACKEND_API_URL=https://your-ongopool-domain.vercel.app/api
   ```

3. **Deploy**:
   - Vercel will automatically build and deploy
   - Static files served from `dist/`
   - API functions deployed as serverless functions

### 3. Post-deployment Configuration

1. **Update backend API URL** in your environment variables:
   ```
   VITE_BACKEND_API_URL=https://your-ongopool-domain.vercel.app/api
   ```

2. **Configure Stripe Webhooks**:
   - Add webhook URL: `https://your-domain.vercel.app/api/stripe/webhooks`
   - Set webhook secret in environment variables

3. **Test payment functionality**:
   - Verify Stripe payments work
   - Test PayPal integration
   - Check real-time features

### 4. Database Setup

The app connects to an existing Supabase database. Ensure:
- Database is accessible from Vercel
- RLS policies are properly configured
- Storage buckets are set up for file uploads

### 5. Domain Configuration

1. **Custom Domain** (optional):
   - Add custom domain in Vercel dashboard
   - Update CORS settings in Supabase if needed

2. **SSL Certificate**:
   - Vercel provides automatic SSL
   - Ensure all API calls use HTTPS

## Troubleshooting

### Build Issues
- Run `npm run build` locally first
- Check for TypeScript errors
- Verify all dependencies are installed

### Payment Issues
- Verify API keys are correctly set
- Check webhook configuration
- Review Vercel function logs

### Database Issues
- Verify Supabase connection string
- Check RLS policies
- Ensure API keys have proper permissions

## Production Checklist

- [ ] All environment variables configured
- [ ] Build completes successfully
- [ ] Payment integration tested
- [ ] Real-time features working
- [ ] Database connection verified
- [ ] SSL certificate active
- [ ] Custom domain configured (if applicable)

---

**OnGoPool** is now ready for production deployment on Vercel!