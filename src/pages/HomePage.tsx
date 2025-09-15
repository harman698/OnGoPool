import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, MapPin, Star, Clock } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { User as UserType } from '../types';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [userProfile, setUserProfile] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentRides, setRecentRides] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchRecentRides();
    }
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentRides = async () => {
    if (!user) return;

    try {
      // Fetch recent rides where user was either driver or passenger (within last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: driverRides, error: driverError } = await supabase
        .from('rides')
        .select(`
          id,
          from_location,
          to_location,
          departure_time,
          status,
          price_per_seat,
          ride_bookings!inner(
            id,
            passenger_id,
            total_amount,
            status,
            seats_booked
          )
        `)
        .eq('driver_id', user.id)
        .eq('ride_bookings.status', 'confirmed')
        .eq('status', 'completed')  // Only show completed rides, hide cancelled
        .gte('departure_time', oneDayAgo)  // Only show rides completed within last 24 hours
        .order('departure_time', { ascending: false })
        .limit(3);

      if (driverError) throw driverError;

      // Fetch recent bookings where user was passenger (within last 24 hours)
      const { data: passengerBookings, error: passengerError } = await supabase
        .from('ride_bookings')
        .select(`
          id,
          total_amount,
          seats_booked,
          status,
          rides!inner(
            id,
            from_location,
            to_location,
            departure_time,
            status,
            driver_id
          )
        `)
        .eq('passenger_id', user.id)
        .eq('status', 'confirmed')
        .eq('rides.status', 'completed')  // Only show completed rides, hide cancelled (data preserved in database)
        .gte('rides.departure_time', oneDayAgo)  // Only show rides completed within last 24 hours
        .order('created_at', { ascending: false })
        .limit(3);

      if (passengerError) throw passengerError;

      // Combine and format rides
      const allRides: any[] = [];

      // Add driver rides
      if (driverRides) {
        driverRides.forEach((ride) => {
          const totalEarnings = ride.ride_bookings?.reduce((sum: number, booking: any) => 
            sum + parseFloat(booking.total_amount), 0) || 0;
          
          allRides.push({
            id: `driver-${ride.id}`,
            from: ride.from_location,
            to: ride.to_location,
            time: formatTimeAgo(ride.departure_time),
            status: ride.status,
            price: `$${totalEarnings.toFixed(2)}`,
            type: 'driver'
          });
        });
      }

      // Add passenger rides
      if (passengerBookings) {
        passengerBookings.forEach((booking) => {
          // Only show completed passenger rides, skip cancelled ones
          if (booking.rides.status === 'completed') {
            allRides.push({
              id: `passenger-${booking.id}`,
              from: booking.rides.from_location,
              to: booking.rides.to_location,
              time: formatTimeAgo(booking.rides.departure_time),
              status: booking.rides.status,
              price: `$${parseFloat(booking.total_amount).toFixed(2)}`,
              type: 'passenger'
            });
          }
        });
      }

      // Sort by time and take most recent 5
      allRides.sort((a, b) => new Date(b.departure_time || 0).getTime() - new Date(a.departure_time || 0).getTime());
      setRecentRides(allRides.slice(0, 5));

    } catch (error) {
      console.error('Error fetching recent rides:', error);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
      return 'Less than an hour ago';
    } else if (diffInHours < 24) {
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    }
  };

  const quickActions = [
    {
      icon: Search,
      label: 'Find Rides',
      description: 'Search for available rides',
      color: 'bg-blue-500',
      action: () => navigate('/find'),
    },
    {
      icon: Plus,
      label: 'Post Ride',
      description: 'Offer a ride to others',
      color: 'bg-green-500',
      action: () => navigate('/post'),
    },
    {
      icon: MapPin,
      label: 'My Trips',
      description: 'View your ride history',
      color: 'bg-purple-500',
      action: () => navigate('/trip'),
    },
  ];



  return (
    <div className="p-4 space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">
          Welcome back{userProfile?.display_name ? `, ${userProfile.display_name}` : ''}!
        </h2>
        <p className="text-blue-100">Ready for your next journey?</p>
        
        <div className="flex items-center mt-4 space-x-4">
          <div className="flex items-center space-x-1">
            <Star className="text-yellow-300 fill-current" size={16} />
            <span className="text-sm">
              {userProfile?.rating && Number(userProfile.rating) > 0 
                ? Number(userProfile.rating).toFixed(1) + ' Rating'
                : 'New User'
              }
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <MapPin className="text-green-300" size={16} />
            <span className="text-sm">{userProfile?.total_rides || 0} Rides</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 gap-4">
          {quickActions.map((action, index) => (
            <button
              key={index}
              onClick={action.action}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center space-x-4 hover:shadow-md transition-shadow"
            >
              <div className={`${action.color} p-3 rounded-full`}>
                <action.icon size={24} className="text-white" />
              </div>
              <div className="flex-1 text-left">
                <h4 className="font-semibold text-gray-900">{action.label}</h4>
                <p className="text-sm text-gray-600">{action.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {recentRides.length > 0 ? (
            recentRides.map((ride) => (
              <div
                key={ride.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {ride.from} → {ride.to}
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Clock size={14} />
                      <span>{ride.time}</span>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        ride.status === 'completed' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {ride.status}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        ride.type === 'driver'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {ride.type}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{ride.price}</div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
              <div className="text-gray-500 mb-2">
                <MapPin size={48} className="mx-auto text-gray-300" />
              </div>
              <h4 className="font-medium text-gray-900 mb-1">No recent activity</h4>
              <p className="text-sm text-gray-600 mb-4">
                Start by finding a ride or posting one to see your activity here.
              </p>
              <div className="flex space-x-2 justify-center">
                <button
                  onClick={() => navigate('/find')}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
                >
                  Find Rides
                </button>
                <button
                  onClick={() => navigate('/post')}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition-colors"
                >
                  Post Ride
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tips */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <div className="flex items-start space-x-3">
          <div className="bg-yellow-100 p-2 rounded-full">
            <span className="text-lg">💡</span>
          </div>
          <div>
            <h4 className="font-semibold text-yellow-800 mb-1">Tip of the day</h4>
            <p className="text-sm text-yellow-700">
              Post your regular commute routes to find consistent ride partners and save more money!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;