import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { rideAutomationService } from './lib/rideAutomationService';

// Pages
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import FindRidesPage from './pages/FindRidesPage';
import AvailableRidesPage from './pages/AvailableRidesPage';
import RideDetailsPage from './pages/RideDetailsPage';
import PostRidePage from './pages/PostRidePage';
import ChatPage from './pages/ChatPage';
import TripPage from './pages/TripPage';
import ProfilePage from './pages/ProfilePage';
import EarningsAnalyticsPage from './pages/EarningsAnalyticsPage';
import PayoutHistoryPage from './pages/PayoutHistoryPage';
import PaymentHistoryPage from './pages/PaymentHistoryPage';
import ReviewHistoryPage from './pages/ReviewHistoryPage';

// Layouts
import DashboardLayout from './layouts/DashboardLayout';

function App() {
  const { initialize, user } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Start ride automation service when user is authenticated
  useEffect(() => {
    if (user) {
      // Start the automation service when user logs in
      rideAutomationService.startAutomation();
    } else {
      // Stop the automation service when user logs out
      rideAutomationService.stopAutomation();
    }

    // Cleanup on unmount
    return () => {
      rideAutomationService.stopAutomation();
    };
  }, [user]);

  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          
          {/* Protected Dashboard Routes */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<HomePage />} />
          </Route>
          <Route path="/find" element={<DashboardLayout />}>
            <Route index element={<FindRidesPage />} />
          </Route>
          <Route path="/available-rides" element={<AvailableRidesPage />} />
          <Route path="/ride-details" element={<RideDetailsPage />} />
          <Route path="/post" element={<DashboardLayout />}>
            <Route index element={<PostRidePage />} />
          </Route>
          <Route path="/ride/:rideId" element={<RideDetailsPage />} />
          
          {/* Other protected routes */}
          <Route path="/trip" element={<DashboardLayout />}>
            <Route index element={<TripPage />} />
          </Route>
          <Route path="/profile" element={<DashboardLayout />}>
            <Route index element={<ProfilePage />} />
          </Route>
          <Route path="/earnings-analytics" element={<EarningsAnalyticsPage />} />
          <Route path="/payout-history" element={<PayoutHistoryPage />} />
          <Route path="/payment-history" element={<PaymentHistoryPage />} />
          <Route path="/review-history" element={<ReviewHistoryPage />} />
          <Route path="/chat" element={<ChatPage />} />
          
          {/* Catch all route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;