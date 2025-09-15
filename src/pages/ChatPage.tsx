import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Send, Phone, MoreVertical, MapPin, Clock, Users, MessageCircle, Search, Plus, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Message, Conversation, RideBooking } from '../types';
import RatingModal from '../components/RatingModal';

interface ChatState {
  bookingId?: number;
  driverId?: string;
  rideDetails?: any;
}

const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [booking, setBooking] = useState<RideBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversations, setConversations] = useState<any[]>([]);
  const [showConversationList, setShowConversationList] = useState(true);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rideData, setRideData] = useState<any>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const chatState = location.state as ChatState;

  useEffect(() => {
    if (chatState?.bookingId) {
      setShowConversationList(false);
      initializeChat();
      // Mark messages as read when entering a specific chat
      markMessagesAsRead();
    } else {
      initializeConversationsList();
    }
  }, [chatState]);

  // Auto-refresh conversations every 30 seconds when on conversation list
  useEffect(() => {
    if (!showConversationList) return;

    const interval = setInterval(() => {
      initializeConversationsList();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [showConversationList]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Set up real-time message subscription
  useEffect(() => {
    if (!chatState?.bookingId || !user || !conversation) return;

    console.log('Setting up real-time subscription for booking:', chatState.bookingId);

    const subscription = supabase
      .channel(`messages:${chatState.bookingId}:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `booking_id=eq.${chatState.bookingId}`,
      }, (payload) => {
        console.log('New message received:', payload);
        const newMessage = payload.new as Message;
        
        // If the message is from the current user, it's already optimistically added.
        // We can skip adding it again to prevent duplicates.
        if (newMessage.sender_id === user?.id) {
          console.log('Skipping own message - already optimistically added');
          return;
        }

        console.log('Processing message from another user:', newMessage.sender_id);
        
        // If it's a message from another user, fetch sender details and add it.
        supabase
          .from('users')
          .select('id, display_name, photo_url')
          .eq('id', newMessage.sender_id)
          .single()
          .then(({ data: senderData, error: senderError }) => {
            if (senderError) {
              console.error('Error fetching sender data:', senderError);
              return;
            }

            const messageWithSender = {
              ...newMessage,
              sender: senderData
            };
            
            console.log('Adding message to state:', messageWithSender);
            setMessages(prevMessages => {
              // Check if message already exists to prevent duplicates
              const messageExists = prevMessages.some(msg => msg.id === newMessage.id);
              if (messageExists) {
                console.log('Message already exists, skipping');
                return prevMessages;
              }
              return [...prevMessages, messageWithSender];
            });
          });
      })
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    // Clean up subscription on unmount or when dependencies change
    return () => {
      console.log('Cleaning up real-time subscription');
      subscription.unsubscribe();
    };
  }, [chatState?.bookingId, user?.id, conversation?.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const extractCityName = (address: string) => {
    if (!address) return address;
    const parts = address.split(',');
    return parts[0].trim();
  };

  const initializeConversationsList = async () => {
    if (!user) return;

    try {
      // First, update past ride statuses
      await supabase.rpc('update_past_ride_statuses');

      // Fetch all conversations for the user
      const { data: conversationsData, error: convError } = await supabase
        .from('conversations')
        .select(`
          *,
          driver:users!conversations_driver_id_fkey(id, display_name, photo_url),
          passenger:users!conversations_passenger_id_fkey(id, display_name, photo_url),
          booking:ride_bookings!conversations_booking_id_fkey(
            id, status, total_amount, seats_booked, from_segment_id, to_segment_id,
            ride:rides!ride_bookings_ride_id_fkey(
              id, from_location, to_location, departure_time, price_per_seat, status, arrival_time
            )
          )
        `)
        .or(`driver_id.eq.${user.id},passenger_id.eq.${user.id}`)
        .order('last_message_at', { ascending: false });

      if (convError) {
        console.error('Error fetching conversations:', convError);
        return;
      }

      // Filter conversations based on 24-hour hiding policy for completed rides
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const filteredConversations = (conversationsData || []).filter((conv) => {
        // Always show conversations for non-completed rides
        if (!conv.booking?.ride || conv.booking.ride.status !== 'completed') {
          return true;
        }
        
        // Hide conversations for cancelled rides (matching TripPage behavior)
        if (conv.booking.ride.status === 'cancelled') {
          return false;
        }
        
        // For completed rides, check 24-hour window
        if (conv.booking.ride.status === 'completed') {
          const departureTime = new Date(conv.booking.ride.departure_time);
          const arrivalTime = conv.booking.ride.arrival_time ? new Date(conv.booking.ride.arrival_time) : null;
          
          // Use arrival time if available, otherwise fall back to departure time + 2h buffer (matching TripPage logic)
          const completionTime = arrivalTime || new Date(departureTime.getTime() + 2 * 60 * 60 * 1000);
          
          // Only show if completed within last 24 hours
          return completionTime.getTime() > oneDayAgo.getTime();
        }
        
        return true;
      });

      // For each filtered conversation, get segment information and latest message
      const conversationsWithSegmentsAndMessages = await Promise.all(
        filteredConversations.map(async (conv) => {
          if (!conv.booking?.ride?.id) {
            return {
              ...conv,
              latestMessage: null,
            };
          }

          // Fetch segment details if segment IDs exist
          let fromSegment = null;
          let toSegment = null;
          
          if (conv.booking.from_segment_id) {
            const { data: fromSegmentData } = await supabase
              .from('ride_segments')
              .select('id, address, segment_order')
              .eq('id', conv.booking.from_segment_id)
              .single();
            fromSegment = fromSegmentData;
          }

          if (conv.booking.to_segment_id) {
            const { data: toSegmentData } = await supabase
              .from('ride_segments')
              .select('id, address, segment_order')
              .eq('id', conv.booking.to_segment_id)
              .single();
            toSegment = toSegmentData;
          }

          const { data: latestMessage, error: messageError } = await supabase
            .from('messages')
            .select(`
              *,
              sender:users!messages_sender_id_fkey(display_name)
            `)
            .eq('booking_id', conv.booking.id)
            .order('created_at', { ascending: false })
            .limit(1);

          // Handle case where no messages exist yet (don't use .single())
          return {
            ...conv,
            booking: {
              ...conv.booking,
              from_segment: fromSegment,
              to_segment: toSegment
            },
            latestMessage: latestMessage && latestMessage.length > 0 ? latestMessage[0] : null,
          };
        })
      );

      setConversations(conversationsWithSegmentsAndMessages);
    } catch (error) {
      console.error('Error initializing conversations list:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeChat = async () => {
    if (!chatState?.bookingId || !user) return;

    try {
      setLoading(true);

      // Fetch the booking with ride details including ride status
      const { data: bookingData, error: bookingError } = await supabase
        .from('ride_bookings')
        .select(`
          *,
          ride:rides!ride_bookings_ride_id_fkey(
            id, from_location, to_location, departure_time, price_per_seat, driver_id, status
          )
        `)
        .eq('id', chatState.bookingId)
        .single();

      if (bookingError) {
        console.error('Error fetching booking:', bookingError);
        alert('Failed to load ride information. Please try again.');
        navigate(-1);
        return;
      }

      // If booking has segment IDs, fetch segment details separately
      let fromSegment = null;
      let toSegment = null;
      
      if (bookingData.from_segment_id) {
        const { data: fromSegmentData } = await supabase
          .from('ride_segments')
          .select('id, address, segment_order')
          .eq('id', bookingData.from_segment_id)
          .single();
        fromSegment = fromSegmentData;
      }

      if (bookingData.to_segment_id) {
        const { data: toSegmentData } = await supabase
          .from('ride_segments')
          .select('id, address, segment_order')
          .eq('id', bookingData.to_segment_id)
          .single();
        toSegment = toSegmentData;
      }

      // Add segment data to booking object
      const bookingWithSegments = {
        ...bookingData,
        from_segment: fromSegment,
        to_segment: toSegment
      };

      setBooking(bookingWithSegments);
      setRideData({
        rideId: bookingData.ride.id,
        rideStatus: bookingData.ride.status,
        bookingStatus: bookingData.status,
        driverId: bookingData.ride.driver_id,
        passengerId: bookingData.passenger_id
      });

      // Try to fetch existing conversation, or create one if it doesn't exist
      let conversationData = null;
      const { data: existingConversation, error: convError } = await supabase
        .from('conversations')
        .select(`
          *,
          driver:users!conversations_driver_id_fkey(id, display_name, photo_url),
          passenger:users!conversations_passenger_id_fkey(id, display_name, photo_url),
          booking:ride_bookings!conversations_booking_id_fkey(
            id, status, total_amount, seats_booked,
            ride:rides!ride_bookings_ride_id_fkey(
              id, from_location, to_location, departure_time, status
            )
          )
        `)
        .eq('booking_id', chatState.bookingId);

      if (convError) {
        console.error('Error fetching conversation:', convError);
      } else if (existingConversation && existingConversation.length > 0) {
        // Conversation exists
        conversationData = existingConversation[0];
      } else {
        // No conversation exists, create one
        console.log('Creating new conversation for booking:', chatState.bookingId);
        const { data: newConversation, error: createError } = await supabase
          .from('conversations')
          .insert({
            booking_id: chatState.bookingId,
            driver_id: bookingData.ride.driver_id,
            passenger_id: bookingData.passenger_id,
            ride_id: bookingData.ride.id,
            last_message_at: new Date().toISOString()
          })
          .select(`
            *,
            driver:users!conversations_driver_id_fkey(id, display_name, photo_url),
            passenger:users!conversations_passenger_id_fkey(id, display_name, photo_url),
            booking:ride_bookings!conversations_booking_id_fkey(
              id, status, total_amount, seats_booked,
              ride:rides!ride_bookings_ride_id_fkey(
                id, from_location, to_location, departure_time, status
              )
            )
          `)
          .single();

        if (createError) {
          console.error('Error creating conversation:', createError);
          alert('Failed to initialize chat. Please try again.');
          navigate(-1);
          return;
        }
        
        conversationData = newConversation;
      }

      setConversation(conversationData);

      // Fetch existing messages
      const { data: existingMessages, error: messagesError } = await supabase
        .from('messages')
        .select(`
          *,
          sender:users!messages_sender_id_fkey(id, display_name, photo_url)
        `)
        .eq('booking_id', chatState.bookingId)
        .order('created_at', { ascending: true });

      if (messagesError) {
        console.error('Error fetching messages:', messagesError);
      } else {
        setMessages(existingMessages || []);
      }

      // Real-time subscription will be set up in a separate useEffect

    } catch (error) {
      console.error('Error initializing chat:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })
    };
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !conversation || !user || sending) return;

    // Check if conversation has the required nested data
    if (!conversation.booking || !conversation.booking.ride || !conversation.booking.ride.id) {
      console.error('Conversation missing booking or ride data:', conversation);
      return;
    }

    try {
      setSending(true);
      const messageContent = newMessage.trim();

      const { data: insertedMessage, error } = await supabase
        .from('messages')
        .insert({
          booking_id: conversation.booking_id,
          ride_id: conversation.booking.ride.id,
          sender_id: user.id,
          message: messageContent,
          is_read: false
        })
        .select()
        .single();

      if (error) throw error;

      // Optimistically add the message to the local state for immediate display
      const messageWithSender: Message = {
        ...insertedMessage,
        sender: {
          id: user.id,
          display_name: user.display_name || 'You',
          photo_url: user.photo_url || '',
        },
      };
      setMessages(prevMessages => [...prevMessages, messageWithSender]);
      setNewMessage(''); // Clear input immediately

      // Update conversation's last message time
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversation.id);

    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handlePassengerCancel = async () => {
    if (!booking || !user || cancelLoading) return;

    const confirmCancel = window.confirm(
      'Are you sure you want to cancel this booking? This action cannot be undone.'
    );

    if (!confirmCancel) return;

    try {
      setCancelLoading(true);

      // Import the booking policy service dynamically
      const { BookingPolicyService } = await import('../lib/bookingPolicyService');
      
      const result = await BookingPolicyService.cancelBooking(booking.id, user.id);

      if (result.success) {
        // Update local booking state
        setBooking(prev => prev ? { ...prev, status: 'cancelled' } : prev);
        
        // Show success message
        alert(result.refunded 
          ? 'Booking cancelled successfully. Your refund will be processed within 3-5 business days.'
          : 'Booking cancelled successfully.'
        );
      } else {
        alert(result.error || 'Failed to cancel booking. Please contact support.');
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Failed to cancel booking. Please try again or contact support.');
    } finally {
      setCancelLoading(false);
    }
  };

  const updateBookingStatus = async (status: 'confirmed' | 'rejected') => {
    if (!booking || !user) return;

    try {
      if (status === 'confirmed') {
        // For confirmed bookings, we need to capture the payment hold first
        console.log('Processing payment capture for booking:', booking.id);
        
        // Import payment hold service dynamically
        const { PaymentHoldService } = await import('../lib/paymentHoldService');
        
        // Capture the payment hold (works for both PayPal and Stripe)
        const captureResult = await PaymentHoldService.capturePaymentHold(booking.id);
        
        if (!captureResult.success) {
          console.error('Payment capture failed:', captureResult.error);
          alert(`Failed to process payment: ${captureResult.error}`);
          return;
        }
        
        console.log('Payment captured successfully:', {
          transactionId: captureResult.transactionId,
          amountCaptured: captureResult.amountCaptured
        });
        
        // The payment capture service already updates the booking status to 'confirmed'
        // and processes the payment, so we don't need to update it manually
        
      } else if (status === 'rejected') {
        // For rejected bookings, we need to refund the payment hold
        console.log('Processing payment refund for booking:', booking.id);
        
        // Import payment hold service dynamically
        const { PaymentHoldService } = await import('../lib/paymentHoldService');
        
        // Refund the payment hold (works for both PayPal and Stripe)
        const refundResult = await PaymentHoldService.refundPaymentHold(booking.id, 'driver_rejected');
        
        if (!refundResult.success) {
          console.error('Payment refund failed:', refundResult.error);
          alert(`Failed to process refund: ${refundResult.error}`);
          return;
        }
        
        console.log('Payment refunded successfully:', {
          refundAmount: refundResult.refundAmount,
          reason: refundResult.reason
        });
        
        // Update booking status to rejected (the refund service may have already done this)
        const { error } = await supabase
          .from('ride_bookings')
          .update({ status: 'rejected' })
          .eq('id', booking.id);

        if (error) {
          console.error('Error updating booking status to rejected:', error);
        }
      }

      // Update local booking state
      setBooking(prev => prev ? { ...prev, status } : prev);

      // Send a system message
      await supabase
        .from('messages')
        .insert({
          booking_id: booking.id,
          ride_id: booking.ride.id,
          sender_id: user.id,
          message: status === 'confirmed' 
            ? 'Ride request accepted! 🎉 Payment has been processed successfully.' 
            : 'Ride request declined. Your payment will be refunded within 3-5 business days.',
          is_read: false
        });

      // Update conversation's last message time
      if (conversation) {
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversation.id);
      }

      // Show success message to driver
      if (status === 'confirmed') {
        alert('Ride request accepted! Payment has been processed and the passenger has been notified.');
      } else {
        alert('Ride request declined. The passenger\'s payment will be refunded automatically.');
      }

    } catch (error) {
      console.error('Error updating booking status:', error);
      alert('Failed to update ride status. Please try again.');
    }
  };

  // Determine other user (driver or passenger)
  const otherUser = conversation ? (
    user?.id === conversation.driver_id ? conversation.passenger : conversation.driver
  ) : null;

  const isDriver = conversation && user?.id === conversation.driver_id;

  // Check if ride is completed and booking is confirmed for review functionality
  const isRideCompleted = (rideData?.rideStatus === 'completed' || booking?.ride?.status === 'completed') && 
                          (rideData?.bookingStatus === 'confirmed' || booking?.status === 'confirmed');
  
  // Determine the user to be rated
  const getRatedUser = () => {
    if (!otherUser || !isRideCompleted) return null;
    return {
      id: otherUser.id,
      name: otherUser.display_name || 'Unknown User',
      photo: otherUser.photo_url
    };
  };

  const openRatingModal = () => {
    if (isRideCompleted && otherUser) {
      setShowRatingModal(true);
    }
  };

  const markMessagesAsRead = async () => {
    if (!chatState?.bookingId || !user) return;

    try {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('booking_id', chatState.bookingId)
        .neq('sender_id', user.id);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const handleRatingSubmitted = () => {
    // Rating submitted successfully, could refresh data or show confirmation
    console.log('Rating submitted for completed ride');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 text-center">Loading chat...</p>
        </div>
      </div>
    );
  }

  if (showConversationList) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col">
        {/* Header */}
        <div className="bg-white/80 backdrop-blur-sm shadow-lg px-4 py-4 flex items-center justify-between border-b border-white/20">
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <ArrowLeft size={24} className="text-gray-700" />
            </button>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Messages</h1>
          </div>
          <div className="flex items-center space-x-2">
            <button className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <Search size={20} className="text-gray-600" />
            </button>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-4">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="bg-gradient-to-br from-blue-100 to-purple-100 rounded-3xl p-8 mb-6 shadow-lg">
                <MessageCircle size={56} className="text-blue-500 mx-auto" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">No conversations yet</h3>
              <p className="text-gray-600 text-center max-w-sm">
                When you book a ride or someone books your ride, conversations will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {conversations.map((conv) => {
                const otherUser = user?.id === conv.driver_id ? conv.passenger : conv.driver;
                
                return (
                  <div
                    key={conv.id}
                    className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border border-white/30"
                    onClick={() => {
                      setShowConversationList(false);
                      navigate('/chat', { 
                        state: { bookingId: conv.booking_id } 
                      });
                    }}
                  >
                    {/* Avatar */}
                    {otherUser?.photo_url && otherUser.photo_url.trim() !== '' ? (
                      <img
                        src={otherUser.photo_url}
                        alt={otherUser.display_name || 'User Avatar'}
                        className="w-12 h-12 rounded-2xl object-cover flex-shrink-0 shadow-lg"
                        onError={(e) => {
                          console.log('Failed to load profile image:', otherUser.photo_url);
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.style.setProperty('display', 'flex', 'important');
                        }}
                      />
                    ) : (
                      <img
                        src="https://public.youware.com/users-website-assets/prod/513ce673-00bf-4c9c-85cf-b2c9e2ab67b2/eae6851d9de5486cbbf967bf4e7a85fa.png"
                        alt="Default Avatar"
                        className="w-12 h-12 rounded-2xl object-cover flex-shrink-0 shadow-lg"
                      />
                    )}
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg" style={{ display: 'none' }}>
                      <span className="text-white font-bold text-sm">
                        {otherUser?.display_name?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div>
                          <h3 className="font-bold text-gray-900 text-lg mb-1">
                            {otherUser?.display_name || 'Unknown User'}
                          </h3>
                          <p className="text-sm text-gray-500 mb-2">
                            {user?.id === conv.driver_id ? 'Passenger' : 'Driver'}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-600 truncate mb-2 font-medium">
                            {conv.booking?.from_segment ? extractCityName(conv.booking.from_segment.address) : extractCityName(conv.booking?.ride?.from_location)} → {conv.booking?.to_segment ? extractCityName(conv.booking.to_segment.address) : extractCityName(conv.booking?.ride?.to_location)}
                          </p>
                          {conv.latestMessage ? (
                            <p className="text-xs text-gray-500 truncate">
                              {conv.latestMessage.sender?.display_name}: {conv.latestMessage.message}
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400 italic">No messages yet</p>
                          )}
                        </div>

                        <div className="flex-shrink-0 ml-3">
                          <span className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm ${
                            conv.booking?.status === 'confirmed' ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white' :
                            conv.booking?.status === 'pending' ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white' :
                            conv.booking?.status === 'cancelled' ? 'bg-gradient-to-r from-gray-400 to-gray-500 text-white' :
                            'bg-gradient-to-r from-red-400 to-pink-500 text-white'
                          }`}>
                            {conv.booking?.status || 'unknown'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col">
      {/* Fixed Header */}
      <div className="bg-white/80 backdrop-blur-sm shadow-lg px-4 py-4 flex items-center justify-between border-b border-white/20 fixed top-0 left-0 right-0 z-10">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <ArrowLeft size={24} className="text-gray-700" />
          </button>
          
          <div className="flex items-center space-x-4">
            {otherUser?.photo_url && otherUser.photo_url.trim() !== '' ? (
              <img
                src={otherUser.photo_url}
                alt={otherUser.display_name || 'User Avatar'}
                className="w-10 h-10 rounded-2xl object-cover shadow-lg"
                onError={(e) => {
                  console.log('Failed to load profile image:', otherUser.photo_url);
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.style.setProperty('display', 'flex', 'important');
                }}
              />
            ) : (
              <img
                src="https://public.youware.com/users-website-assets/prod/513ce673-00bf-4c9c-85cf-b2c9e2ab67b2/eae6851d9de5486cbbf967bf4e7a85fa.png"
                alt="Default Avatar"
                className="w-10 h-10 rounded-2xl object-cover shadow-lg"
              />
            )}
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg" style={{ display: 'none' }}>
              <span className="text-white font-bold text-sm">
                {otherUser?.display_name?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-lg">
                {otherUser?.display_name || 'Unknown User'}
              </h2>
              <p className="text-sm text-gray-500">
                {isDriver ? 'Passenger' : 'Driver'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <Phone size={20} className="text-gray-600" />
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <MoreVertical size={20} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* Fixed Ride Info Header */}
      {booking && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-blue-100/50 p-4 mx-4 rounded-2xl shadow-sm fixed top-24 left-0 right-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-900 text-lg">Ride Request</h3>
            <span className={`px-4 py-2 rounded-xl text-sm font-bold shadow-sm ${
              booking.status === 'confirmed' ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white' :
              booking.status === 'rejected' ? 'bg-gradient-to-r from-red-400 to-pink-500 text-white' :
              booking.status === 'cancelled' ? 'bg-gradient-to-r from-gray-400 to-gray-500 text-white' :
              'bg-gradient-to-r from-yellow-400 to-orange-500 text-white'
            }`}>
              {booking.status}
            </span>
          </div>
          
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center space-x-2">
              <MapPin size={14} className="text-gray-500" />
              <span>
                {booking.from_segment ? extractCityName(booking.from_segment.address) : extractCityName(booking.ride.from_location)} → {booking.to_segment ? extractCityName(booking.to_segment.address) : extractCityName(booking.ride.to_location)}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1">
                <Clock size={14} className="text-gray-500" />
                <span>{new Date(booking.ride.departure_time).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Users size={14} className="text-gray-500" />
                <span>{booking.seats_booked} seat{booking.seats_booked > 1 ? 's' : ''}</span>
              </div>
              <span className="font-medium">${booking.total_amount}</span>
            </div>
          </div>

          {/* Action Buttons */}
          {isDriver && booking.status === 'pending' && (
            <div className="flex space-x-4 mt-4">
              <button
                onClick={() => updateBookingStatus('confirmed')}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white py-3 px-6 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Accept Ride
              </button>
              <button
                onClick={() => updateBookingStatus('rejected')}
                className="flex-1 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white py-3 px-6 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Decline
              </button>
            </div>
          )}

          {/* Passenger Cancel Button - for both pending and confirmed bookings */}
          {!isDriver && (booking.status === 'pending' || booking.status === 'confirmed') && (
            <div className="mt-4">
              <button
                onClick={handlePassengerCancel}
                disabled={cancelLoading}
                className="w-full bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-3 px-6 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:scale-100"
              >
                {cancelLoading ? 'Cancelling...' : 
                 booking.status === 'pending' ? 'Cancel Request' : 'Cancel Booking'}
              </button>
            </div>
          )}

          {/* Review Button for Completed Rides */}
          {isRideCompleted && (
            <div className="mt-4">
              <button
                onClick={openRatingModal}
                className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white py-3 px-6 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center justify-center space-x-2"
              >
                <Star size={20} className="fill-current" />
                <span>Leave Review</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-4 pb-20" style={{ marginTop: booking ? '280px' : '96px' }}>
        <div className="space-y-4 py-6">
          {messages.map((message) => {
            const isOwnMessage = message.sender_id === user?.id;
            
            return (
              <div
                key={message.id}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                  isOwnMessage
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                    : 'bg-white/80 backdrop-blur-sm text-gray-800 border border-white/30'
                }`}>
                  <p className="text-sm">{message.message}</p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Fixed Message Input */}
      <div className="bg-white/80 backdrop-blur-sm border-t border-white/20 p-4 fixed bottom-0 left-0 right-0">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="w-full px-6 py-4 rounded-2xl border-2 border-gray-200 focus:border-blue-500 focus:ring-0 text-gray-800 placeholder-gray-500 shadow-sm"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={sending}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 text-white p-4 rounded-2xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
          >
            <Send size={20} />
          </button>
        </div>
      </div>

      {/* Rating Modal */}
      {showRatingModal && getRatedUser() && booking && (
        <RatingModal
          isOpen={showRatingModal}
          onClose={() => setShowRatingModal(false)}
          bookingId={booking.id}
          ratedUserId={getRatedUser()!.id}
          ratedUserName={getRatedUser()!.name}
          ratedUserPhoto={getRatedUser()!.photo}
          ratingType={isDriver ? 'driver_to_passenger' : 'passenger_to_driver'}
          onRatingSubmitted={handleRatingSubmitted}
        />
      )}
    </div>
  );
};

export default ChatPage;