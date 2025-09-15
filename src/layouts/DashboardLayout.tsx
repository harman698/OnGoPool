import React, { useState, useEffect } from 'react';
import { Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import BottomNav from '../components/BottomNav';
import { MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const DashboardLayout: React.FC = () => {
  const { user, loading } = useAuthStore();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user) {
      fetchUnreadMessages();
      
      // Subscribe to new messages for real-time updates
      const subscription = supabase
        .channel('messages')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        }, () => {
          fetchUnreadMessages();
        })
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user]);

  const fetchUnreadMessages = async () => {
    if (!user) return;

    try {
      // Get conversations where user is participant with their associated ride_ids
      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select(`
          id,
          booking:ride_bookings!conversations_booking_id_fkey(
            ride:rides!ride_bookings_ride_id_fkey(id)
          )
        `)
        .or(`driver_id.eq.${user.id},passenger_id.eq.${user.id}`);

      if (convError) throw convError;

      if (conversations && conversations.length > 0) {
        // Extract ride_ids from conversations
        const rideIds = conversations
          .map(c => c.booking?.ride?.id)
          .filter(Boolean);
        
        // Extract booking_ids from conversations
        const bookingIds = conversations
          .map(c => c.booking?.id)
          .filter(Boolean);
        
        if (bookingIds.length > 0) {
          // Count unread messages in these bookings
          const { count, error: msgError } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .in('booking_id', bookingIds)
            .neq('sender_id', user.id)
            .eq('is_read', false);

          if (msgError) throw msgError;
          setUnreadCount(count || 0);
        } else {
          setUnreadCount(0);
        }
      } else {
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error fetching unread messages:', error);
      setUnreadCount(0);
    }
  };

  const handleChatClick = () => {
    navigate('/chat');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">OnGoPool</h1>
        <button 
          onClick={handleChatClick}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors relative"
        >
          <MessageCircle size={24} className="text-gray-600" />
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className="pb-20">
        <Outlet />
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
};

export default DashboardLayout;