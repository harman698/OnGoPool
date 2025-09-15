import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  Clock, 
  Calendar, 
  Users, 
  MessageCircle,
  CheckCircle,
  Edit,
  Activity,
  Navigation,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Ride, RideBooking } from '../types';
import { calculateRealTimeETAs } from '../utils/distance';

interface LiveETARideDetailsProps {
  ride: Ride;
  isOpen: boolean;
  onClose: () => void;
  onEditRide?: (ride: Ride) => void;
  onUpdateRideStatus?: (rideId: number, status: string) => void;
  activeTab: 'active' | 'completed';
}

interface ETAData {
  stopIndex: number;
  stopName: string;
  eta: Date;
  cumulativeDuration: number;
  formattedETA: string;
  isCurrentlyActive: boolean;
}

const LiveETARideDetails: React.FC<LiveETARideDetailsProps> = ({
  ride,
  isOpen,
  onClose,
  onEditRide,
  onUpdateRideStatus,
  activeTab
}) => {
  const navigate = useNavigate();
  const [rideBookings, setRideBookings] = useState<RideBooking[]>([]);
  const [rideETAs, setRideETAs] = useState<ETAData[]>([]);
  const [etaLoading, setEtaLoading] = useState(false);
  const [lastETAUpdate, setLastETAUpdate] = useState<Date | null>(null);

  // Extract city name from full address
  const extractCityName = (address: string) => {
    if (!address) return address;
    
    const parts = address.split(',');
    let cityName = parts[0].trim();
    
    if (cityName.includes('Region of')) {
      const regionMatch = cityName.match(/Region of (.+)/i);
      if (regionMatch) {
        cityName = regionMatch[1];
      }
    }
    
    return cityName;
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

  // Fetch ride bookings and calculate initial ETAs
  useEffect(() => {
    if (isOpen && ride) {
      fetchRideBookings();
      calculateETAs();
    }
  }, [isOpen, ride]);

  // Auto-refresh ETAs for active rides with improved logic
  useEffect(() => {
    if (!isOpen || !ride || activeTab !== 'active') return;

    const now = new Date();
    const departureTime = new Date(ride.departure_time);
    const hoursDiff = (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Only auto-refresh for truly active trips and limit refresh duration
    // Refresh from 2 hours before departure until 4 hours after departure
    const shouldAutoRefresh = hoursDiff <= 2 && hoursDiff >= -4;
    
    if (shouldAutoRefresh) {
      console.log(`Auto-refresh enabled for active trip (${hoursDiff.toFixed(1)}h from departure)`);
      
      const interval = setInterval(() => {
        console.log('Auto-refreshing ETAs for active trip...');
        calculateETAs(true);
      }, 30000); // Reduced to 30 seconds to avoid excessive API calls

      return () => {
        console.log('Auto-refresh disabled for trip');
        clearInterval(interval);
      };
    } else {
      console.log(`Auto-refresh not active for trip (${hoursDiff.toFixed(1)}h from departure)`);
    }
  }, [isOpen, ride, activeTab]);

  const fetchRideBookings = async () => {
    try {
      const { data, error } = await supabase
        .from('ride_bookings')
        .select(`
          *,
          passenger:users!ride_bookings_passenger_id_fkey(
            id, display_name, photo_url, rating, phone
          )
        `)
        .eq('ride_id', ride.id);

      if (error) throw error;
      setRideBookings(data || []);
    } catch (error) {
      console.error('Error fetching ride bookings:', error);
    }
  };

  const calculateETAs = async (isAutoRefresh = false) => {
    if (!isAutoRefresh) {
      setEtaLoading(true);
    }

    try {
      // FIXED: Build complete stops array including ALL segments in proper order
      let stops = [];
      
      if (ride.ride_segments && ride.ride_segments.length > 0) {
        // Sort all segments by order to ensure proper route sequence
        const allSegments = [...ride.ride_segments]
          .sort((a: any, b: any) => a.segment_order - b.segment_order);
        
        // Include origin (ride start), all intermediate stops, and destination
        stops = allSegments.map((segment: any) => ({
          name: extractCityName(segment.address), 
          lat: segment.lat || 0, 
          lng: segment.lng || 0,
          segmentOrder: segment.segment_order,
          isPickup: segment.is_pickup
        }));
        
        // Add origin if not already included (segment_order 0)
        const hasOrigin = stops.some(stop => stop.segmentOrder === 0);
        if (!hasOrigin) {
          stops.unshift({
            name: extractCityName(ride.from_location), 
            lat: ride.from_lat || 0, 
            lng: ride.from_lng || 0,
            segmentOrder: 0,
            isPickup: false
          });
        }
        
        // Add destination if it's different from last segment
        const lastStop = stops[stops.length - 1];
        const destinationName = extractCityName(ride.to_location);
        if (lastStop.name !== destinationName) {
          stops.push({
            name: destinationName,
            lat: ride.to_lat || 0, 
            lng: ride.to_lng || 0,
            segmentOrder: stops.length,
            isPickup: false
          });
        }
        
      } else {
        // Fallback: just origin and destination
        stops = [
          { name: extractCityName(ride.from_location), lat: ride.from_lat || 0, lng: ride.from_lng || 0, segmentOrder: 0, isPickup: false },
          { name: extractCityName(ride.to_location), lat: ride.to_lat || 0, lng: ride.to_lng || 0, segmentOrder: 1, isPickup: false }
        ];
      }

      const departureTime = new Date(ride.departure_time);
      const currentTime = new Date();

      // Validate that we have departure time before calling ETA calculation
      if (!departureTime || isNaN(departureTime.getTime())) {
        console.error('Invalid departure time for ETA calculation:', ride.departure_time);
        throw new Error('Invalid departure time');
      }

      console.log('Calculating live ETAs with enhanced routing system...');
      console.log('Stops for calculation:', stops.map(s => ({ 
        name: s.name, 
        hasValidCoords: s.lat !== 0 && s.lng !== 0 
      })));
      
      const etas = await calculateRealTimeETAs(currentTime, stops, departureTime);
      
      setRideETAs(etas);
      setLastETAUpdate(new Date());
      console.log('Live ETAs calculated successfully:', etas.length, 'stops');
    } catch (error) {
      console.error('Error calculating ETAs:', error);
      
      // Show user-friendly error message for ETA calculation failures
      if (!isAutoRefresh) {
        console.warn('ETA calculation failed, showing static route information');
        // Keep existing static route display as fallback
      }
    } finally {
      if (!isAutoRefresh) {
        setEtaLoading(false);
      }
    }
  };

  const handleRefreshETAs = () => {
    calculateETAs();
  };

  if (!isOpen || !ride) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center space-x-3">
            <h3 className="text-2xl font-bold text-gray-900">Live Trip Details</h3>
            {activeTab === 'active' && (
              <div className="flex items-center space-x-1 text-green-600">
                <Activity size={16} className="animate-pulse" />
                <span className="text-sm font-medium">Live</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-full transition-colors shadow-sm"
          >
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Live ETA Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-gray-900 text-lg flex items-center space-x-2">
                <Navigation size={20} className="text-blue-600" />
                <span>Live Route & ETAs</span>
              </h4>
              <div className="flex items-center space-x-2">
                {lastETAUpdate && (
                  <span className="text-xs text-gray-500">
                    Updated {lastETAUpdate.toLocaleTimeString()}
                  </span>
                )}
                <button
                  onClick={handleRefreshETAs}
                  disabled={etaLoading}
                  className={`p-2 rounded-full transition-colors ${
                    etaLoading ? 'bg-gray-100' : 'hover:bg-gray-100'
                  }`}
                >
                  <RefreshCw size={16} className={`text-gray-600 ${etaLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl p-4 border border-blue-100">
              {etaLoading && rideETAs.length === 0 ? (
                <div className="text-center py-8">
                  <RefreshCw size={24} className="animate-spin text-blue-600 mx-auto mb-2" />
                  <p className="text-blue-700 font-medium">Calculating live ETAs...</p>
                </div>
              ) : rideETAs.length > 0 ? (
                <div className="space-y-3">
                  {rideETAs.map((eta, index) => (
                    <div key={eta.stopIndex}>
                      {index > 0 && (
                        <div className="border-l-2 border-dashed border-blue-300 ml-2 h-4"></div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`w-4 h-4 rounded-full ${
                            index === 0 
                              ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                              : index === rideETAs.length - 1
                              ? 'bg-gradient-to-r from-red-500 to-pink-500'
                              : 'bg-gradient-to-r from-yellow-500 to-orange-500'
                          } ${eta.isCurrentlyActive ? 'ring-2 ring-blue-400 ring-offset-2 shadow-lg' : ''}`}></div>
                          <span className={`font-semibold ${
                            eta.isCurrentlyActive ? 'text-blue-700' : 'text-gray-800'
                          }`}>
                            {index === 0 ? '🚗 ' : index === rideETAs.length - 1 ? '🏁 ' : '📍 '}
                            {index === 0 || index === rideETAs.length - 1 
                              ? eta.stopName 
                              : `Stop: ${eta.stopName}`}
                          </span>
                        </div>
                        <div className={`flex items-center space-x-1 text-sm font-bold px-3 py-1 rounded-full ${
                          eta.isCurrentlyActive 
                            ? 'bg-blue-200 text-blue-800' 
                            : 'bg-white/70 text-gray-700'
                        }`}>
                          <Clock size={12} />
                          <span>{eta.formattedETA}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Live status indicator - only show when actually auto-refreshing */}
                  {activeTab === 'active' && (() => {
                    const now = new Date();
                    const departureTime = new Date(ride.departure_time);
                    const hoursDiff = (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60);
                    const isLiveUpdating = hoursDiff <= 2 && hoursDiff >= -4;
                    
                    return isLiveUpdating ? (
                      <div className="mt-4 flex items-center justify-center space-x-2 text-green-600 bg-green-50 rounded-lg py-2">
                        <Activity size={16} className="animate-pulse" />
                        <span className="text-sm font-medium">ETAs updating live every 30 seconds</span>
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center justify-center space-x-2 text-blue-600 bg-blue-50 rounded-lg py-2">
                        <Clock size={16} />
                        <span className="text-sm font-medium">Scheduled ETAs (live updates {hoursDiff > 2 ? 'start 2h before departure' : 'ended 4h after departure'})</span>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                // ENHANCED: Fallback showing ALL segments including intermediate stops
                <div className="space-y-3">
                  {/* Show origin */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-green-50">
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"></div>
                      <span className="font-semibold text-gray-800">🚗 {extractCityName(ride.from_location)}</span>
                    </div>
                    <div className="text-sm font-medium text-gray-600">
                      {new Date(ride.departure_time).toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </div>
                  
                  {/* Show ALL intermediate stops */}
                  {ride.ride_segments && ride.ride_segments
                    .filter((segment: any) => segment.segment_order > 0)
                    .sort((a: any, b: any) => a.segment_order - b.segment_order)
                    .map((segment: any, index: number) => (
                      <div key={segment.id}>
                        <div className="border-l-2 border-dashed border-gray-300 ml-2 h-4"></div>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-yellow-50">
                          <div className="flex items-center space-x-3">
                            <div className={`w-4 h-4 rounded-full ${
                              segment.segment_order === ride.ride_segments.length 
                                ? 'bg-gradient-to-r from-red-500 to-pink-500' 
                                : 'bg-gradient-to-r from-yellow-500 to-orange-500'
                            }`}></div>
                            <div>
                              <span className="font-medium text-gray-800">
                                {segment.segment_order === ride.ride_segments.length ? '🏁 ' : '📍 '}
                                {extractCityName(segment.address)}
                              </span>
                              <div className="text-xs text-gray-500">
                                {segment.is_pickup ? 'Stop' : 'Final destination'}
                              </div>
                            </div>
                          </div>
                          <div className="text-sm font-medium text-gray-600">
                            Est. ETA
                          </div>
                        </div>
                      </div>
                    ))
                  }
                  
                  {/* Show destination if no segments */}
                  {(!ride.ride_segments || ride.ride_segments.length === 0) && (
                    <>
                      <div className="border-l-2 border-dashed border-gray-300 ml-2 h-6"></div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-red-50">
                        <div className="flex items-center space-x-3">
                          <div className="w-4 h-4 bg-gradient-to-r from-red-500 to-pink-500 rounded-full"></div>
                          <span className="font-semibold text-gray-800">🏁 {extractCityName(ride.to_location)}</span>
                        </div>
                        <div className="text-sm font-medium text-gray-600">
                          Est. ETA
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Trip Info Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-xl p-4">
              <span className="text-sm text-blue-600 font-medium">Departure</span>
              <p className="font-bold text-gray-900">{formatTime(ride.departure_time)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4">
              <span className="text-sm text-green-600 font-medium">Price per seat</span>
              <p className="font-bold text-gray-900">${ride.price_per_seat}</p>
            </div>
            <div className="bg-purple-50 rounded-xl p-4">
              <span className="text-sm text-purple-600 font-medium">Available seats</span>
              <p className="font-bold text-gray-900">{ride.available_seats}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-4">
              <span className="text-sm text-orange-600 font-medium">Total bookings</span>
              <p className="font-bold text-gray-900">{rideBookings.length}</p>
            </div>
          </div>

          {/* Passenger Bookings */}
          {rideBookings.length > 0 && (
            <div>
              <h4 className="font-bold text-gray-900 mb-4 text-lg">Passenger Bookings</h4>
              <div className="space-y-3">
                {rideBookings.map((booking) => (
                  <div key={booking.id} className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl border border-gray-100">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-lg">
                          {booking.passenger?.display_name?.[0]?.toUpperCase() || 'P'}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">
                          {booking.passenger?.display_name || 'Passenger'}
                        </div>
                        <div className="text-sm text-gray-600">
                          {booking.seats_booked} seat{booking.seats_booked > 1 ? 's' : ''} • ${booking.total_amount}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        booking.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                        booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {booking.status.toUpperCase()}
                      </span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/chat', {
                            state: {
                              bookingId: booking.id
                            }
                          });
                        }}
                        className="p-2 hover:bg-white rounded-full transition-colors"
                      >
                        <MessageCircle size={18} className="text-gray-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            {activeTab === 'active' && onEditRide && onUpdateRideStatus && (
              <>
                {(() => {
                  const now = new Date();
                  const departureTime = new Date(ride.departure_time);
                  const hoursDiff = (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60);
                  
                  if (hoursDiff > 2) {
                    return (
                      <>
                        <button
                          onClick={() => onEditRide(ride)}
                          className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-4 px-4 rounded-xl font-bold transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg"
                        >
                          <Edit size={20} />
                          <span>Edit Trip</span>
                        </button>
                        <button
                          onClick={() => onUpdateRideStatus(ride.id, 'cancelled')}
                          className="flex-1 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white py-4 px-4 rounded-xl font-bold transition-all duration-200 shadow-lg"
                        >
                          Cancel Trip
                        </button>
                      </>
                    );
                  } else {
                    return (
                      <>
                        <button
                          onClick={() => onEditRide(ride)}
                          className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white py-4 px-4 rounded-xl font-bold transition-all duration-200 shadow-lg"
                        >
                          Edit Trip
                        </button>
                        <button
                          onClick={() => onUpdateRideStatus(ride.id, 'cancelled')}
                          className="flex-1 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white py-4 px-4 rounded-xl font-bold transition-all duration-200 shadow-lg"
                        >
                          Cancel Trip
                        </button>
                      </>
                    );
                  }
                })()}
              </>
            )}

            {activeTab === 'completed' && (
              <div className="w-full text-center text-gray-500 py-4 bg-gray-50 rounded-xl">
                <CheckCircle size={24} className="mx-auto mb-2 text-green-500" />
                <span className="font-medium">Trip Completed</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveETARideDetails;