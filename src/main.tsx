import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PayPalScriptProvider } from '@paypal/react-paypal-js';
import "./index.css";
import App from "./App.tsx";
import { PayPalService } from './lib/paypalService';

// PayPal configuration - automatically detects sandbox vs production mode
const paypalOptions = PayPalService.getSDKOptions();

// Log PayPal environment info on app startup
const envInfo = PayPalService.getEnvironmentInfo();
console.log(`🚀 PayPal initialized in ${envInfo.mode.toUpperCase()} mode`);
if (envInfo.isLive) {
  console.log('✅ PRODUCTION PayPal payments enabled - real money will be processed');
} else {
  console.log('⚠️ SANDBOX PayPal payments - test mode only');
  console.log('💡 Set VITE_PAYPAL_SANDBOX_MODE=false in .env for live payments');
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PayPalScriptProvider options={paypalOptions}>
      <App />
    </PayPalScriptProvider>
  </StrictMode>
);