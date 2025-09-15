import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, Users, DollarSign, Car, FileText, Plus, X, Route, Timer, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { getMultiStopRouteInfo, calculateStopETAs, formatDuration, formatDistance } from '../utils/distance';
import { rideConflictService, ConflictCheckResult } from '../lib/rideConflictService';
import { DriverResponseService } from '../lib/driverResponseService';
import TermsCheckbox from '../components/TermsCheckbox';

interface Stop {
  id: string;
  address: string;
  coordinates?: { lat: number; lng: number };
}

interface RouteInfo {
  totalDistance: number;
  totalDuration: number;
  segments: Array<{ distance: number; duration: number; from: number; to: number }>;
}

interface PriceTier {
  id: number;
  name: string;
  description: string;
  base_price_per_km: string;
  short_distance_rate: string;
  short_distance_threshold_km: string;
  long_distance_threshold_km: string;
}

const PostRidePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [remainingRides, setRemainingRides] = useState<number | null>(null);
  const [loadingRideLimit, setLoadingRideLimit] = useState(true);
  const [licenseStatus, setLicenseStatus] = useState<{
    status: string | null;
    expirationDate: string | null;
    loading: boolean;
  }>({ status: null, expirationDate: null, loading: true });
  const [rideData, setRideData] = useState({
    fromLocation: '',
    toLocation: '',
    departureDate: '',
    departureTime: '',
    availableSeats: 1,
    pricePerSeat: '',
    carModel: '',
    carColor: '',
    licensePlate: '',
    description: '',
  });
  const [coordinates, setCoordinates] = useState({
    from: { lat: 0, lng: 0 },
    to: { lat: 0, lng: 0 },
  });
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [currentTier, setCurrentTier] = useState<PriceTier | null>(null);
  const [priceValidation, setPriceValidation] = useState<{
    isValid: boolean;
    message: string;
    suggestedPrice?: number;
  }>({ isValid: true, message: '' });
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Define fetchRemainingRides outside useEffect, using useCallback
  const fetchRemainingRides = useCallback(async (departureDate?: string) => {
    if (!user) return;
    
    try {
      setLoadingRideLimit(true);
      // Use departure date from form if available, otherwise default to today
      const targetDate = departureDate || rideData.departureDate || new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .rpc('get_remaining_rides', { 
          user_id: user.id, 
          departure_date: targetDate 
        });
      
      if (error) throw error;
      setRemainingRides(data);
    } catch (error) {
      console.error('Error fetching remaining rides:', error);
      setRemainingRides(2); // Default to 2 if error
    } finally {
      setLoadingRideLimit(false);
    }
  }, [user, rideData.departureDate]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRideData({
      ...rideData,
      [name]: value,
    });

    // Validate price when price per seat changes
    if (name === 'pricePerSeat') {
      validatePrice(parseFloat(value));
    }
    
    // Update remaining rides when departure date changes
    if (name === 'departureDate' && value) {
      fetchRemainingRides(value);
    }
  };

  // Fetch price tiers, remaining rides, and license status on component mount
  useEffect(() => {
    const fetchPriceTiers = async () => {
      try {
        const { data, error } = await supabase
          .from('price_tiers')
          .select('*')
          .eq('is_active', true)
          .order('priority');
        
        if (error) throw error;
        setPriceTiers(data || []);
      } catch (error) {
        console.error('Error fetching price tiers:', error);
      }
    };

    const fetchLicenseStatus = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('users')
          .select('license_verification_status, license_expiration_date')
          .eq('id', user.id)
          .single();
        
        if (error) throw error;
        
        setLicenseStatus({
          status: data.license_verification_status,
          expirationDate: data.license_expiration_date,
          loading: false
        });
      } catch (error) {
        console.error('Error fetching license status:', error);
        setLicenseStatus({
          status: null,
          expirationDate: null,
          loading: false
        });
      }
    };

    fetchPriceTiers();
    fetchRemainingRides();
    fetchLicenseStatus();
  }, [user, fetchRemainingRides]);

  // Get applicable price tier based on distance
  const getPriceTierForDistance = (distanceKm: number): PriceTier | null => {
    return priceTiers.find(tier => {
      const minDistance = parseFloat(tier.short_distance_threshold_km);
      const maxDistance = parseFloat(tier.long_distance_threshold_km);
      return distanceKm >= minDistance && distanceKm <= maxDistance;
    }) || null;
  };

  // Validate price against tier limits
  const validatePrice = (price: number) => {
    if (!routeInfo || !price || price <= 0) {
      setPriceValidation({ isValid: true, message: '' });
      return;
    }

    const distanceKm = routeInfo.totalDistance;
    const tier = getPriceTierForDistance(distanceKm);
    
    if (!tier) {
      setPriceValidation({ 
        isValid: true, 
        message: 'No pricing tier found for this distance' 
      });
      return;
    }

    const minPricePerKm = parseFloat(tier.base_price_per_km);
    const maxPricePerKm = parseFloat(tier.short_distance_rate);
    
    const minTotalPrice = minPricePerKm * distanceKm;
    const maxTotalPrice = maxPricePerKm * distanceKm;

    if (price < minTotalPrice) {
      setPriceValidation({
        isValid: false,
        message: `Price too low. Minimum: $${minTotalPrice.toFixed(2)} per seat`,
        suggestedPrice: minTotalPrice
      });
    } else if (price > maxTotalPrice) {
      setPriceValidation({
        isValid: false,
        message: `Price too high. Maximum: $${maxTotalPrice.toFixed(2)} per seat`,
        suggestedPrice: maxTotalPrice
      });
    } else {
      setPriceValidation({
        isValid: true,
        message: `Valid price range: $${minTotalPrice.toFixed(2)} - $${maxTotalPrice.toFixed(2)} per seat`
      });
    }

    setCurrentTier(tier);
  };

  const addStop = () => {
    setStops([...stops, { id: Date.now().toString(), address: '' }]);
  };

  const updateStop = (id: string, address: string, coords?: { lat: number; lng: number }) => {
    setStops(stops.map(stop => 
      stop.id === id ? { ...stop, address, coordinates: coords } : stop
    ));
  };

  const removeStop = (id: string) => {
    setStops(stops.filter(stop => stop.id !== id));
  };

  // Calculate route information whenever coordinates change
  useEffect(() => {
    const calculateRoute = async () => {
      // Check if we have at least origin and destination coordinates
      if (coordinates.from.lat === 0 || coordinates.to.lat === 0) return;
      
      setRouteLoading(true);
      
      try {
        // Build coordinates array including stops
        const allCoordinates = [coordinates.from];
        
        // Add stop coordinates if they exist
        stops.forEach(stop => {
          if (stop.coordinates) {
            allCoordinates.push(stop.coordinates);
          }
        });
        
        allCoordinates.push(coordinates.to);
        
        // Only calculate if we have at least 2 points
        if (allCoordinates.length >= 2) {
          const routeData = await getMultiStopRouteInfo(allCoordinates);
          setRouteInfo(routeData);
          
          // Validate current price when route changes
          if (rideData.pricePerSeat) {
            validatePrice(parseFloat(rideData.pricePerSeat));
          }
        }
      } catch (error) {
        console.error('Error calculating route:', error);
      } finally {
        setRouteLoading(false);
      }
    };
    
    calculateRoute();
  }, [coordinates, stops]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Check terms acceptance
    if (!termsAccepted) {
      alert('Please accept the Terms and Conditions to post a ride.');
      return;
    }

    // Check if driver can post rides (not suspended/banned)
    try {
      console.log('Checking driver eligibility for user:', user.id);
      const eligibility = await DriverResponseService.canDriverPostRide(user.id);
      
      if (!eligibility.canPost) {
        console.error('Driver eligibility check failed:', eligibility.reason);
        alert(eligibility.reason || 'You cannot post rides at this time');
        return;
      }
      console.log('Driver eligibility check passed');
    } catch (error) {
      console.error('Error checking driver eligibility:', error);
      alert('Unable to verify your driver status. Please try again or contact support if the issue persists.');
      return;
    }

    // Check license verification before allowing ride posting
    try {
      const { data: userProfile, error } = await supabase
        .from('users')
        .select('license_verification_status, license_expiration_date')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      // Check if license is verified
      if (userProfile.license_verification_status !== 'verified') {
        let message = 'License verification is required to post rides.\n\n';
        
        switch (userProfile.license_verification_status) {
          case 'unverified':
          case null:
            message += 'Please upload your driver\'s license in your profile to start offering rides.';
            break;
          case 'pending':
            message += 'Your license is currently under review. Please wait for verification to complete.';
            break;
          case 'rejected':
            message += 'Your license was rejected. Please upload a new, valid license document in your profile.';
            break;
          default:
            message += 'Please verify your driver\'s license in your profile.';
        }
        
        message += '\n\nWould you like to go to your profile now?';
        
        if (confirm(message)) {
          navigate('/profile');
        }
        return;
      }

      // Check if license is expired
      if (userProfile.license_expiration_date) {
        const expirationDate = new Date(userProfile.license_expiration_date);
        const now = new Date();
        
        if (expirationDate < now) {
          alert('Your driver\'s license has expired. Please update your license information in your profile before posting rides.');
          navigate('/profile');
          return;
        }
        
        // Warn if expiring within 30 days
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        
        if (expirationDate < thirtyDaysFromNow) {
          const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (!confirm(`Your driver's license expires in ${daysUntilExpiration} days. Do you want to continue posting this ride?`)) {
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error checking license verification:', error);
      alert('Unable to verify your license status. Please try again.');
      return;
    }

    // Check price validation before submitting
    if (!priceValidation.isValid) {
      alert('Please set a valid price within the allowed range.');
      return;
    }

    // FIXED TIMEZONE ISSUE: Prepare departure and arrival times using local time
    const departureDateTime = new Date(`${rideData.departureDate}T${rideData.departureTime}`);
    const arrivalDateTime = routeInfo 
      ? new Date(departureDateTime.getTime() + routeInfo.totalDuration * 60 * 1000)
      : new Date(departureDateTime.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours if no route info

    // Check for ride conflicts before proceeding (still use ISO for API consistency)
    try {
      const conflictResult = await rideConflictService.checkRideConflicts(
        user.id,
        departureDateTime.toISOString(),
        arrivalDateTime.toISOString()
      );

      if (conflictResult && conflictResult.conflict_exists) {
        const conflictMessage = rideConflictService.formatConflictMessage(conflictResult);
        alert(`⚠️ Schedule Conflict\n\n${conflictMessage}\n\nPlease choose a different departure time.`);
        return;
      }
    } catch (error) {
      console.error('Error checking ride conflicts:', error);
      alert('Unable to verify schedule conflicts. Please try again.');
      return;
    }

    setLoading(true);

    try {
      // Prepare stops data for JSON storage
      const stopsData = stops.length > 0 ? stops.map(stop => ({
        address: stop.address,
        lat: stop.coordinates?.lat || null,
        lng: stop.coordinates?.lng || null
      })).filter(stop => stop.address.trim()) : null;

      // FIXED TIMEZONE ISSUE: Properly handle user's intended local time
      // Create date in local time and format as ISO string without timezone conversion
      const localDepartureDate = new Date(`${rideData.departureDate}T${rideData.departureTime}`);
      
      // Format the date to preserve the user's intended local time in database
      // This prevents the timezone conversion issue where Sep 12 8PM becomes Sep 13 12AM UTC
      const year = localDepartureDate.getFullYear();
      const month = String(localDepartureDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDepartureDate.getDate()).padStart(2, '0');
      const hours = String(localDepartureDate.getHours()).padStart(2, '0');
      const minutes = String(localDepartureDate.getMinutes()).padStart(2, '0');
      const seconds = String(localDepartureDate.getSeconds()).padStart(2, '0');
      
      const departureDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      
      // Calculate arrival time based on route duration (also preserve local time)
      let arrivalDateTime = null;
      if (routeInfo?.totalDuration) {
        const localArrivalDate = new Date(localDepartureDate.getTime() + routeInfo.totalDuration * 60 * 1000);
        const arrYear = localArrivalDate.getFullYear();
        const arrMonth = String(localArrivalDate.getMonth() + 1).padStart(2, '0');
        const arrDay = String(localArrivalDate.getDate()).padStart(2, '0');
        const arrHours = String(localArrivalDate.getHours()).padStart(2, '0');
        const arrMinutes = String(localArrivalDate.getMinutes()).padStart(2, '0');
        const arrSeconds = String(localArrivalDate.getSeconds()).padStart(2, '0');
        
        arrivalDateTime = `${arrYear}-${arrMonth}-${arrDay} ${arrHours}:${arrMinutes}:${arrSeconds}`;
      }

      // Create the ride
      const { data: rideData_result, error: rideError } = await supabase
        .from('rides')
        .insert([
          {
            driver_id: user.id,
            from_location: rideData.fromLocation,
            to_location: rideData.toLocation,
            from_lat: coordinates.from.lat || null,
            from_lng: coordinates.from.lng || null,
            to_lat: coordinates.to.lat || null,
            to_lng: coordinates.to.lng || null,
            departure_time: departureDateTime,
            arrival_time: arrivalDateTime,
            estimated_duration: routeInfo?.totalDuration || null,
            available_seats: rideData.availableSeats,
            price_per_seat: parseFloat(rideData.pricePerSeat),
            car_model: rideData.carModel,
            car_color: rideData.carColor,
            license_plate: rideData.licensePlate,
            description: rideData.description,
            status: 'active',
            stops: stopsData,
            use_direct_route: stops.length === 0, // True for direct routes, false for multi-stop
          }
        ])
        .select()
        .single();

      if (rideError) throw rideError;

      // Add stops as segments if any
      if (stops.length > 0) {
        const segments = [];
        
        // Add pickup location
        segments.push({
          ride_id: rideData_result.id,
          address: rideData.fromLocation,
          lat: coordinates.from.lat || null,
          lng: coordinates.from.lng || null,
          segment_order: 0,
          is_pickup: true,
        });

        // Add stops
        stops.forEach((stop, index) => {
          if (stop.address.trim()) {
            segments.push({
              ride_id: rideData_result.id,
              address: stop.address,
              lat: stop.coordinates?.lat || null,
              lng: stop.coordinates?.lng || null,
              segment_order: index + 1,
              is_pickup: true,
            });
          }
        });

        // Add destination
        segments.push({
          ride_id: rideData_result.id,
          address: rideData.toLocation,
          lat: coordinates.to.lat || null,
          lng: coordinates.to.lng || null,
          segment_order: segments.length,
          is_pickup: false,
        });

        const { error: segmentError } = await supabase
          .from('ride_segments')
          .insert(segments);

        if (segmentError) {
          console.error('Error creating segments:', segmentError);
        }
      }

      alert('Ride posted successfully!');
      
      // Update remaining rides count
      if (remainingRides !== null && remainingRides !== 999) {
        setRemainingRides(prev => Math.max(0, (prev || 0) - 1));
      }
      navigate('/trip');
    } catch (error) {
      console.error('Error posting ride:', error);
      alert('Failed to post ride. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Get current date and time for minimum datetime
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const minDateTime = now.toISOString().slice(0, 16);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors mr-3"
          >
            <ArrowLeft size={24} className="text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Post a Ride</h1>
        </div>
        
        {/* Daily Ride Limit Display */}
        <div className="flex items-center space-x-2">
          {loadingRideLimit ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          ) : remainingRides !== null && remainingRides < 999 ? (
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              remainingRides > 0 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              {remainingRides > 0 
                ? `${remainingRides} ride${remainingRides !== 1 ? 's' : ''} left today`
                : 'Daily limit reached'
              }
            </div>
          ) : remainingRides === 999 ? (
            <div className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
              Unlimited rides
            </div>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        {/* Route Details */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Route Details</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">From</label>
              <AddressAutocomplete
                value={rideData.fromLocation}
                onChange={(value, coords) => {
                  setRideData({ ...rideData, fromLocation: value });
                  if (coords) {
                    setCoordinates({ ...coordinates, from: coords });
                  }
                }}
                placeholder="Enter pickup location"
              />
            </div>

            {/* Optional Stops */}
            {stops.map((stop) => (
              <div key={stop.id}>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stop</label>
                <div className="relative">
                  <AddressAutocomplete
                    value={stop.address}
                    onChange={(value, coords) => updateStop(stop.id, value, coords)}
                    placeholder="Enter stop location"
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => removeStop(stop.id)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-red-500 hover:text-red-700 z-10"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addStop}
              className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={16} />
              <span>Add Stop</span>
            </button>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">To</label>
              <AddressAutocomplete
                value={rideData.toLocation}
                onChange={(value, coords) => {
                  setRideData({ ...rideData, toLocation: value });
                  if (coords) {
                    setCoordinates({ ...coordinates, to: coords });
                  }
                }}
                placeholder="Enter destination"
              />
            </div>
          </div>
        </div>

        {/* Route Information Display */}
        {routeInfo && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Route className="mr-2 text-blue-600" size={20} />
              Route Information
            </h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white/70 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-1">
                  <MapPin size={16} className="text-blue-600" />
                  <span className="text-sm font-medium text-gray-600">Total Distance</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{formatDistance(routeInfo.totalDistance)}</p>
              </div>
              
              <div className="bg-white/70 rounded-xl p-4">
                <div className="flex items-center space-x-2 mb-1">
                  <Timer size={16} className="text-purple-600" />
                  <span className="text-sm font-medium text-gray-600">Total Duration</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{formatDuration(routeInfo.totalDuration)}</p>
              </div>
            </div>

            {routeInfo.segments.length > 1 && (
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Route Segments</h4>
                <div className="space-y-2">
                  {routeInfo.segments.map((segment, index) => (
                    <div key={index} className="flex items-center justify-between bg-white/50 rounded-lg p-3">
                      <span className="text-sm text-gray-600">
                        Segment {index + 1}
                      </span>
                      <div className="flex space-x-4">
                        <span className="text-sm font-medium text-blue-600">
                          {formatDistance(segment.distance)}
                        </span>
                        <span className="text-sm font-medium text-purple-600">
                          {formatDuration(segment.duration)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {routeLoading && (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-sm text-gray-600">Calculating route...</span>
              </div>
            )}
          </div>
        )}

        {/* Trip Details */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Trip Details</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Departure Date</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="date"
                  name="departureDate"
                  required
                  value={rideData.departureDate}
                  onChange={handleInputChange}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Departure Time</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <select
                  name="departureTime"
                  required
                  value={rideData.departureTime}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select departure time</option>
                  {Array.from({ length: 24 }, (_, hour) => {
                    return Array.from({ length: 4 }, (_, quarter) => {
                      const minutes = quarter * 15;
                      const timeString = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                      const displayTime = new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      });
                      
                      return (
                        <option key={`${hour}-${quarter}`} value={timeString}>
                          {displayTime}
                        </option>
                      );
                    });
                  }).flat()}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Available Seats</label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <select
                  name="availableSeats"
                  value={rideData.availableSeats}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                    <option key={num} value={num}>
                      {num} seat{num > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price per Seat
                {currentTier && (
                  <span className="ml-2 text-xs text-gray-500 font-normal">
                    ({currentTier.name})
                  </span>
                )}
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="number"
                  name="pricePerSeat"
                  required
                  min="1"
                  step="0.01"
                  value={rideData.pricePerSeat}
                  onChange={handleInputChange}
                  className={`w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent ${
                    priceValidation.isValid 
                      ? 'border-gray-300 focus:ring-blue-500' 
                      : 'border-red-300 focus:ring-red-500 bg-red-50'
                  }`}
                  placeholder="0.00"
                />
                {priceValidation.suggestedPrice && !priceValidation.isValid && (
                  <button
                    type="button"
                    onClick={() => {
                      setRideData({
                        ...rideData,
                        pricePerSeat: priceValidation.suggestedPrice!.toFixed(2)
                      });
                      validatePrice(priceValidation.suggestedPrice!);
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 transition-colors"
                  >
                    Use ${priceValidation.suggestedPrice.toFixed(2)}
                  </button>
                )}
              </div>
              
              {/* Price validation message */}
              {priceValidation.message && (
                <div className={`mt-2 flex items-start space-x-2 text-sm ${
                  priceValidation.isValid ? 'text-green-600' : 'text-red-600'
                }`}>
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{priceValidation.message}</span>
                </div>
              )}
              

            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 text-gray-400" size={20} />
                <textarea
                  name="description"
                  value={rideData.description}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Add any special instructions or notes..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Car Details */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Car Details</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Car Model</label>
              <div className="relative">
                <Car className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  name="carModel"
                  value={rideData.carModel}
                  onChange={handleInputChange}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Toyota Camry"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Car Color</label>
              <input
                type="text"
                name="carColor"
                value={rideData.carColor}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Blue"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">License Plate</label>
              <input
                type="text"
                name="licensePlate"
                value={rideData.licensePlate}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., ABC-123"
              />
            </div>
          </div>
        </div>

        {/* License Verification Warning */}
        {!licenseStatus.loading && licenseStatus.status !== 'verified' && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle size={20} className="text-orange-600" />
              <div className="flex-1">
                <h4 className="text-orange-800 font-semibold">License Verification Required</h4>
                <p className="text-orange-700 text-sm mb-3">
                  {licenseStatus.status === 'pending' 
                    ? 'Your license is under review. You cannot post rides until verification is complete.'
                    : licenseStatus.status === 'rejected'
                    ? 'Your license was rejected. Please upload a new license document in your profile.'
                    : 'You need to verify your driver\'s license before posting rides.'
                  }
                </p>
                <button
                  onClick={() => navigate('/profile')}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Go to Profile
                </button>
              </div>
            </div>
          </div>
        )}

        {/* License Expiration Warning */}
        {!licenseStatus.loading && licenseStatus.status === 'verified' && licenseStatus.expirationDate && (
          (() => {
            const expirationDate = new Date(licenseStatus.expirationDate);
            const now = new Date();
            const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            
            if (expirationDate < now) {
              return (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center space-x-2">
                    <AlertCircle size={20} className="text-red-600" />
                    <div className="flex-1">
                      <h4 className="text-red-800 font-semibold">License Expired</h4>
                      <p className="text-red-700 text-sm mb-3">
                        Your driver's license expired on {expirationDate.toLocaleDateString()}. Please update your license information.
                      </p>
                      <button
                        onClick={() => navigate('/profile')}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                      >
                        Update License
                      </button>
                    </div>
                  </div>
                </div>
              );
            } else if (daysUntilExpiration <= 30) {
              return (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <div className="flex items-center space-x-2">
                    <AlertCircle size={20} className="text-yellow-600" />
                    <div>
                      <h4 className="text-yellow-800 font-semibold">License Expiring Soon</h4>
                      <p className="text-yellow-700 text-sm">
                        Your license expires in {daysUntilExpiration} days ({expirationDate.toLocaleDateString()}). 
                        Consider updating your license information.
                      </p>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()
        )}

        {/* Daily Limit Warning */}
        {remainingRides !== null && remainingRides <= 0 && remainingRides !== 999 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle size={20} className="text-red-600" />
              <div>
                <h4 className="text-red-800 font-semibold">Daily Limit Reached</h4>
                <p className="text-red-700 text-sm">
                  You can only post 2 rides per day. Your limit will reset tomorrow.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Terms and Conditions */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <TermsCheckbox
            checked={termsAccepted}
            onChange={setTermsAccepted}
            context="posting"
            required={true}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={
            loading || 
            !priceValidation.isValid || 
            !termsAccepted ||
            (remainingRides !== null && remainingRides <= 0 && remainingRides !== 999) ||
            licenseStatus.status !== 'verified' ||
            (!licenseStatus.loading && licenseStatus.status === 'verified' && licenseStatus.expirationDate && new Date(licenseStatus.expirationDate) < new Date())
          }
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white py-4 px-6 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:transform-none transition-all duration-200"
        >
          {loading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>Posting Ride...</span>
            </div>
          ) : licenseStatus.status !== 'verified' ? (
            licenseStatus.status === 'pending' ? 'License Under Review' :
            licenseStatus.status === 'rejected' ? 'License Rejected' :
            'License Verification Required'
          ) : (!licenseStatus.loading && licenseStatus.expirationDate && new Date(licenseStatus.expirationDate) < new Date()) ? (
            'License Expired'
          ) : remainingRides !== null && remainingRides <= 0 && remainingRides !== 999 ? (
            'Daily Limit Reached'
          ) : (
            'Post Ride'
          )}
        </button>
      </form>
    </div>
  );
};

export default PostRidePage;