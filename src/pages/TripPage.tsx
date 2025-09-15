import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  MapPin, 
  Clock, 
  Users, 
  Calendar, 
  Edit, 
  X, 
  CheckCircle, 
  AlertCircle,
  DollarSign,
  MessageCircle,
  Car,
  Plus,
  TrendingUp,
  Activity,
  Star
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { Ride, RideBooking } from '../types';

import { DriverResponseService } from '../lib/driverResponseService';
import LiveETARideDetails from '../components/LiveETARideDetails';
import EditRideModal from '../components/EditRideModal';

type TripStatus = 'active' | 'completed';

const TripPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TripStatus>('active');
  const [rides, setRides] = useState<Record<TripStatus, Ride[]>>({
    active: [],
    completed: []
  });
  const [loading, setLoading] = useState(true);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [editingRide, setEditingRide] = useState<Ride | null>(null);

  useEffect(() => {
    if (user) {
      fetchDriverRides();
    }
  }, [user]);



  // Function to check for time conflicts
  const checkTimeConflict = async (newRideDate: string, newRideTime: string, excludeRideId?: number) => {
    if (!user || !newRideDate || !newRideTime) return false;

    try {
      const newDateTime = new Date(`${newRideDate}T${newRideTime}`);
      const newStartTime = newDateTime.getTime();
      const newEndTime = newStartTime + (6 * 60 * 60 * 1000); // 6 hours later

      // Fetch driver's active rides
      const { data: driverRides, error } = await supabase
        .from('rides')
        .select('id, departure_time, arrival_time, estimated_duration')
        .eq('driver_id', user.id)
        .in('status', ['active', 'confirmed'])
        .neq('id', excludeRideId || 0);

      if (error) throw error;

      for (const ride of driverRides || []) {
        // FIXED: Validate departure_time before creating Date object
        if (!ride.departure_time) {
          console.warn(`Ride ${ride.id} has null/undefined departure_time, skipping conflict check`);
          continue;
        }

        const departureDate = new Date(ride.departure_time);
        if (isNaN(departureDate.getTime())) {
          console.warn(`Ride ${ride.id} has invalid departure_time: ${ride.departure_time}, skipping conflict check`);
          continue;
        }

        const rideStartTime = departureDate.getTime();
        let rideEndTime: number;

        if (ride.arrival_time) {
          const arrivalDate = new Date(ride.arrival_time);
          if (isNaN(arrivalDate.getTime())) {
            console.warn(`Ride ${ride.id} has invalid arrival_time: ${ride.arrival_time}, using estimated duration`);
            rideEndTime = ride.estimated_duration ? rideStartTime + (ride.estimated_duration * 60 * 1000) : rideStartTime + (6 * 60 * 60 * 1000);
          } else {
            rideEndTime = arrivalDate.getTime();
          }
        } else if (ride.estimated_duration) {
          rideEndTime = rideStartTime + (ride.estimated_duration * 60 * 1000);
        } else {
          // Default to 6 hours if no end time available
          rideEndTime = rideStartTime + (6 * 60 * 60 * 1000);
        }

        // Check for overlap
        const isOverlapping = (
          (newStartTime >= rideStartTime && newStartTime < rideEndTime) ||
          (newEndTime > rideStartTime && newEndTime <= rideEndTime) ||
          (newStartTime <= rideStartTime && newEndTime >= rideEndTime)
        );

        if (isOverlapping) {
          const conflictDate = new Date(ride.departure_time).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          setTimeConflictError(`Time conflict detected with existing ride on ${conflictDate}`);
          return true;
        }
      }

      setTimeConflictError('');
      return false;
    } catch (error) {
      console.error('Error checking time conflict:', error);
      return false;
    }
  };

  const fetchDriverRides = async () => {
    if (!user) return;

    try {
      // First, update past ride statuses
      await supabase.rpc('update_past_ride_statuses');

      const { data, error } = await supabase
        .from('rides')
        .select(`
          *,
          ride_bookings!left(
            id, passenger_id, seats_booked, status, total_amount,
            passenger:users!ride_bookings_passenger_id_fkey(
              id, display_name, photo_url, rating
            )
          ),
          ride_segments!left(
            id, address, segment_order, is_pickup
          )
        `)
        .eq('driver_id', user.id)
        .order('departure_time', { ascending: false });

      if (error) throw error;

      const now = new Date();
      const categorizedRides = {
        active: [] as Ride[],
        completed: [] as Ride[]
      };

      data?.forEach((ride) => {
        // FIXED: Validate departure_time before creating Date object
        if (!ride.departure_time) {
          console.warn(`Ride ${ride.id} has null/undefined departure_time, skipping`);
          return;
        }

        const departureTime = new Date(ride.departure_time);
        if (isNaN(departureTime.getTime())) {
          console.warn(`Ride ${ride.id} has invalid departure_time: ${ride.departure_time}, skipping`);
          return;
        }

        // FIXED: Validate arrival_time before creating Date object
        let arrivalTime = null;
        if (ride.arrival_time) {
          arrivalTime = new Date(ride.arrival_time);
          if (isNaN(arrivalTime.getTime())) {
            console.warn(`Ride ${ride.id} has invalid arrival_time: ${ride.arrival_time}, using null`);
            arrivalTime = null;
          }
        }
        
        // Use arrival time if available, otherwise fall back to departure time + buffer
        const completionTime = arrivalTime || new Date(departureTime.getTime() + 2 * 60 * 60 * 1000); // +2 hours buffer
        const timeDiff = completionTime.getTime() - now.getTime();
        const hoursDiff = timeDiff / (1000 * 60 * 60);

        // SAFE DELETION POLICY: Hide cancelled rides from app, preserve in database
        if (ride.status === 'cancelled') {
          // HIDDEN: Cancelled rides completely hidden from app UI (data preserved in database)
          return; // Skip cancelled rides - don't show in any section
        } else if (ride.status === 'completed') {
          // Hide completed rides older than 1 day
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          if (completionTime.getTime() > oneDayAgo.getTime()) {
            categorizedRides.completed.push(ride);
          }
          // Rides completed more than 1 day ago are hidden but data preserved in database
        } else if (hoursDiff > -1) {
          // Before arrival time or within 1 hour after arrival = active
          categorizedRides.active.push(ride);
        } else {
          // More than 1 hour past arrival = completed (within last day)
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          if (completionTime.getTime() > oneDayAgo.getTime()) {
            categorizedRides.completed.push(ride);
          }
          // Rides completed more than 1 day ago are hidden but data preserved in database
        }
      });

      setRides(categorizedRides);
    } catch (error) {
      console.error('Error fetching driver rides:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRideClick = async (ride: Ride) => {
    setSelectedRide(ride);
  };



  // SAFE DELETION POLICY: Only update status, never delete from database
  const updateRideStatus = async (rideId: number, status: string) => {
    try {
      // SAFE: Updates status only, preserves all data in database
      const { error } = await supabase
        .from('rides')
        .update({ status })  // 'cancelled' or 'completed'
        .eq('id', rideId);

      if (error) throw error;

      // If cancelling a ride, track it for driver warnings
      if (status === 'cancelled' && user) {
        try {
          const warningData = await DriverResponseService.trackDriverCancellation(user.id, rideId);
          
          // Show warning message if applicable
          if (warningData.warningLevel !== 'none') {
            let warningMessage = '';
            switch (warningData.warningLevel) {
              case 'warning':
                warningMessage = 'Warning: You have cancelled multiple rides recently. Excessive cancellations may result in account suspension.';
                break;
              case 'suspension':
                warningMessage = `Your account has been temporarily suspended until ${warningData.suspensionUntil?.toLocaleDateString()} due to repeated cancellations.`;
                break;
              case 'banned':
                warningMessage = 'Your account has been banned due to excessive cancellations. Please contact support.';
                break;
            }
            if (warningMessage) {
              alert(warningMessage);
            }
          }
        } catch (warningError) {
          console.error('Error tracking driver cancellation:', warningError);
          // Don't fail the cancellation if warning tracking fails
        }
      }
      
      // Refresh rides - data preserved, only display filtering changes
      fetchDriverRides();
      setSelectedRide(null);
      
      if (status === 'cancelled') {
        alert('Ride cancelled and removed from your trip list - data preserved in database');
      } else {
        alert(`Ride ${status} successfully - data preserved in database`);
      }
    } catch (error) {
      console.error('Error updating ride status:', error);
      alert('Failed to update ride status');
    }
  };



  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Extract city name from full address
  const extractCityName = (address: string) => {
    if (!address) return address;
    
    // Split by comma and get the first part (usually the city/main location)
    const parts = address.split(',');
    
    // Take the first part and clean it up
    let cityName = parts[0].trim();
    
    // Handle common patterns like "Region of Waterloo" -> "Waterloo"
    if (cityName.includes('Region of')) {
      const regionMatch = cityName.match(/Region of (.+)/i);
      if (regionMatch) {
        cityName = regionMatch[1];
      }
    }
    
    // Handle patterns like "Southwestern Ontario" -> just return as is since it's descriptive
    // Handle patterns like "Golden Horseshoe" -> just return as is
    
    return cityName;
  };

  const getStatusColor = (status: TripStatus) => {
    switch (status) {
      case 'active':
        return 'from-blue-500 to-purple-500';
      case 'completed':
        return 'from-green-500 to-emerald-500';
    }
  };

  const getStatusIcon = (status: TripStatus) => {
    switch (status) {
      case 'active':
        return <Activity size={20} className="text-white" />;
      case 'completed':
        return <CheckCircle size={20} className="text-white" />;
    }
  };

  const tabs: { key: TripStatus; label: string }[] = [
    { key: 'active', label: 'Active & Upcoming' },
    { key: 'completed', label: 'Completed' }
  ];

  // Calculate stats
  const totalRides = Object.values(rides).flat().length;
  const activeRides = rides.active.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading your trips...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pb-24">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 text-white overflow-hidden">
        <div className="px-4 pt-8 pb-12">
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold">My Trips</h1>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 sm:p-4 text-center min-w-0">
              <div className="text-xl sm:text-2xl font-bold truncate">{totalRides}</div>
              <div className="text-blue-100 text-xs sm:text-sm">Total Trips</div>
            </div>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 sm:p-4 text-center min-w-0">
              <div className="text-xl sm:text-2xl font-bold truncate">{activeRides}</div>
              <div className="text-blue-100 text-xs sm:text-sm">Active & Upcoming</div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-4">
          <div className="flex space-x-1 bg-white/10 backdrop-blur-sm rounded-2xl p-1 overflow-hidden">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center space-x-1 sm:space-x-2 py-3 px-2 sm:px-4 rounded-xl font-semibold transition-all duration-200 min-w-0 ${
                  activeTab === tab.key
                    ? 'bg-white text-gray-900 shadow-lg'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="flex-shrink-0">{getStatusIcon(tab.key)}</span>
                <span className="truncate text-sm sm:text-base">{tab.label}</span>
                <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${
                  activeTab === tab.key
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-white/20 text-white'
                }`}>
                  {rides[tab.key].length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="px-4 py-6">
        {rides[activeTab].length === 0 ? (
          <div className="text-center py-16">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r ${getStatusColor(activeTab)} mb-6`}>
              {getStatusIcon(activeTab)}
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              No {activeTab === 'active' ? 'active or upcoming' : 'completed'} trips
            </h3>
            <p className="text-gray-600 mb-8 max-w-sm mx-auto">
              {activeTab === 'active' 
                ? 'You have no active or upcoming rides. Create a new ride to start earning!'
                : 'No completed rides to show yet. Your trip history will appear here.'}
            </p>
            {activeTab === 'active' && (
              <button
                onClick={() => navigate('/post')}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center space-x-2 mx-auto text-sm sm:text-base"
              >
                <Plus size={18} className="sm:w-5 sm:h-5" />
                <span>Create New Ride</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {rides[activeTab].map((ride) => (
              <div
                key={ride.id}
                onClick={() => handleRideClick(ride)}
                className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-200 transition-all duration-300 cursor-pointer transform hover:-translate-y-1 overflow-hidden"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold text-white bg-gradient-to-r ${
                        ride.status === 'active' ? 'from-green-500 to-emerald-500' :
                        ride.status === 'cancelled' ? 'from-red-500 to-pink-500' :
                        'from-blue-500 to-purple-500'
                      }`}>
                        {ride.status.toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-500 font-medium">
                        {ride.available_seats} seats available
                      </span>
                      {ride.ride_bookings && ride.ride_bookings.length > 0 && (
                        <span className="text-sm text-blue-600 font-medium">
                          {ride.ride_bookings.length} booking{ride.ride_bookings.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
                        <span className="font-semibold text-gray-800">{extractCityName(ride.from_location)}</span>
                      </div>
                      <div className="border-l-2 border-dashed border-gray-300 ml-1.5 h-4"></div>
                      <div className="flex items-center space-x-3">
                        <div className="w-3 h-3 bg-gradient-to-r from-red-500 to-pink-500 rounded-full"></div>
                        <span className="font-semibold text-gray-800">{extractCityName(ride.to_location)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                      ${ride.price_per_seat}
                    </div>
                    <div className="text-sm text-gray-500 font-medium">per seat</div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2 text-gray-600">
                      <Calendar size={16} />
                      <span className="text-sm font-medium">{formatTime(ride.departure_time)}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-gray-600">
                      <Users size={16} />
                      <span className="text-sm font-medium">{ride.ride_bookings?.length || 0} passengers</span>
                    </div>
                  </div>
                  {ride.car_model && (
                    <span className="text-sm text-gray-500 font-medium bg-gray-50 px-3 py-1 rounded-full">
                      {ride.car_model}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Live ETA Ride Details Modal */}
      <LiveETARideDetails
        ride={selectedRide!}
        isOpen={!!selectedRide}
        onClose={() => setSelectedRide(null)}
        onEditRide={(ride) => {
          setEditingRide(ride);
          setSelectedRide(null); // Close the details modal
        }}
        onUpdateRideStatus={updateRideStatus}
        activeTab={activeTab}
      />

      {/* Edit Ride Modal */}
      <EditRideModal
        ride={editingRide!}
        isOpen={!!editingRide}
        onClose={() => setEditingRide(null)}
        onRideUpdated={() => {
          fetchDriverRides(); // Refresh the rides list
          setEditingRide(null); // Close the modal
        }}
      />
    </div>
  );
};

export default TripPage;