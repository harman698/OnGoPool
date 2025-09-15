import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  MapPin, 
  Clock, 
  Users, 
  Calendar, 
  ArrowLeft,
  DollarSign,
  Car,
  Navigation
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { getRouteInfo, getMultiStopRouteInfo, calculateStopETAs, calculateSegmentPriceFromCoordinates } from '../utils/distance';

interface RideSegment {
  id: number;
  address: string;
  segment_order: number;
  is_pickup: boolean;
  lat?: number;
  lng?: number;
}

interface SegmentMatch {
  ride: any;
  fromSegment: RideSegment;
  toSegment: RideSegment;
  segmentPrice: number;
  estimatedPickupTime: string;
  estimatedDropoffTime: string;
  availableSeats: number;
  realTimeETA?: boolean;
  actualDistance?: number;
  actualDuration?: number;
}

const AvailableRidesPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  
  const searchParams = location.state as {
    fromLocation: string;
    toLocation: string;
    fromCoords?: { lat: number; lng: number };
    toCoords?: { lat: number; lng: number };
    date: string;
    passengers: number;
  };

  const [loading, setLoading] = useState(true);
  const [segmentMatches, setSegmentMatches] = useState<SegmentMatch[]>([]);
  const [groupedMatches, setGroupedMatches] = useState<{[date: string]: SegmentMatch[]}>({});

  useEffect(() => {
    if (searchParams && user) {
      findSegmentMatches();
    }
  }, [searchParams, user]);

  const findSegmentMatches = async () => {
    if (!searchParams || !user) return;

    setLoading(true);
    try {
      // Get all rides for the specified date
      // Simplified date filtering - use local date string matching instead of complex UTC calculations
      const searchDate = searchParams.date; // Format: YYYY-MM-DD
      
      console.log('=== ENHANCED SEARCH DEBUG START ===');
      console.log('🔍 Search Configuration:');
      console.log('  - Search date:', searchDate);
      console.log('  - User ID:', user.id);
      console.log('  - Search params:', {
        fromLocation: searchParams.fromLocation,
        toLocation: searchParams.toLocation,
        fromCoords: searchParams.fromCoords,
        toCoords: searchParams.toCoords,
        date: searchParams.date,
        passengers: searchParams.passengers
      });
      console.log('  - Current timestamp:', new Date().toISOString());

      // Get all active rides and filter by date using simpler string matching
      let allRides = null;
      let ridesError = null;
      
      try {
        console.log('📊 Executing Supabase Query:');
        console.log('  - Table: rides');
        console.log('  - Status filter: active');
        console.log('  - Excluding driver:', user.id);
        
        // SAFE DELETION POLICY: Only show active rides (data preserved in database)
        const result = await supabase
          .from('rides')
          .select(`
            *,
            driver:users!rides_driver_id_fkey(
              id, display_name, photo_url, rating, car_model, car_plate
            )
          `)
          .eq('status', 'active')  // Only show active rides, cancelled/completed hidden but preserved
          .neq('driver_id', user.id)
          .order('departure_time', { ascending: true });
          
        allRides = result.data || [];
        ridesError = result.error;
        
        console.log('📈 Database Query Results:');
        console.log('  - Raw rides fetched:', allRides?.length || 0);
        console.log('  - Query error:', ridesError);
        console.log('  - Raw rides data structure:', allRides?.map(r => ({
          id: r.id,
          from: r.from_location,
          to: r.to_location,
          departure: r.departure_time,
          status: r.status,
          use_direct_route: r.use_direct_route,
          available_seats: r.available_seats
        })));
      } catch (err) {
        console.error('💥 Initial query error:', err);
        allRides = [];
        ridesError = err;
      }

      if (ridesError) {
        console.error('❌ Supabase query failed:', ridesError);
        allRides = [];
      } else {
        console.log('✅ Supabase query succeeded');
        
        // ENHANCED: Include future rides on same route, not just specific date
        if (allRides) {
          console.log('📅 Enhanced Date Filtering Process (Including Future Rides):');
          console.log('  - Before date filtering:', allRides.length);
          console.log('  - Target search date:', searchDate);
          
          const dateFilterResults = [];
          const searchDateTime = new Date(searchDate);
          
          // Get rides from selected date and up to 30 days in the future
          allRides = allRides.filter(ride => {
            try {
              // FIXED: Validate departure_time before creating Date object
              if (!ride.departure_time) {
                console.warn(`Ride ${ride.id} has null/undefined departure_time, skipping`);
                return false;
              }

              // FIXED: Check if departure_time creates a valid Date object
              const departureDate = new Date(ride.departure_time);
              if (isNaN(departureDate.getTime())) {
                console.warn(`Ride ${ride.id} has invalid departure_time: ${ride.departure_time}, skipping`);
                return false;
              }

              const rideDate = departureDate.toISOString().split('T')[0];
              const rideDateTime = new Date(rideDate);
              
              // Include rides from search date onwards (today and future)
              const isOnOrAfterSearchDate = rideDateTime >= searchDateTime;
              
              // Limit to 30 days in the future to keep results manageable
              const thirtyDaysFromSearch = new Date(searchDateTime);
              thirtyDaysFromSearch.setDate(thirtyDaysFromSearch.getDate() + 30);
              const isWithin30Days = rideDateTime <= thirtyDaysFromSearch;
              
              const matches = isOnOrAfterSearchDate && isWithin30Days;
              
              dateFilterResults.push({
                rideId: ride.id,
                rideDate,
                searchDate,
                isOnOrAfterSearchDate,
                isWithin30Days,
                matches,
                fullDepartureTime: ride.departure_time
              });
              
              return matches;
            } catch (error) {
              console.error(`Error processing ride ${ride.id} departure_time: ${ride.departure_time}`, error);
              return false; // Skip rides that cause errors
            }
          });
          
          console.log('  - Enhanced date filter details:', dateFilterResults);
          console.log('  - After enhanced date filtering (30 days forward):', allRides.length);
        }
        
        console.log('✅ Final Query Results:');
        console.log('  - Successfully fetched rides:', allRides?.length || 0);
        console.log('  - Ride summaries:', allRides?.map(r => `ID:${r.id} ${r.from_location} → ${r.to_location}`));
      }
      
      // Additional error handling
      if (ridesError) {
        console.error('💥 Rides query crashed:', ridesError);
        allRides = [];
        console.warn('⚠️ Failed to fetch rides, showing empty results');
      }

      // Now fetch segments for rides that need them
      const segmentRideIds = (allRides || []).filter(ride => !ride.use_direct_route).map(ride => ride.id);
      let ridesWithSegments = [];
      
      if (segmentRideIds.length > 0) {
        try {
          console.log('🗺️ Fetching Segments for Multi-Stop Rides:');
          console.log('  - Segment ride IDs:', segmentRideIds);
          
          // SAFE DELETION POLICY: Only get segments for active rides (data preserved in database)
          const { data: segments, error: segmentsError } = await supabase
            .from('ride_segments')
            .select('*')
            .in('ride_id', segmentRideIds)
            .order('ride_id')
            .order('segment_order');

          if (segmentsError) {
            console.error('❌ Failed to fetch segments:', segmentsError);
            console.warn('⚠️ Using rides without segment data');
          } else {
            console.log('📍 Segments Query Results:');
            console.log('  - Segments found:', segments?.length || 0);
            console.log('  - Segments by ride:', segments?.reduce((acc, seg) => {
              acc[seg.ride_id] = (acc[seg.ride_id] || 0) + 1;
              return acc;
            }, {}));
            
            // Combine rides with their segments
            ridesWithSegments = (allRides || []).map(ride => ({
              ...ride,
              segments: !ride.use_direct_route ? (segments || []).filter(seg => seg.ride_id === ride.id) : [],
              ride_segments: !ride.use_direct_route ? (segments || []).filter(seg => seg.ride_id === ride.id) : []
            }));
          }
        } catch (err) {
          console.error('💥 Segments query crashed:', err);
          console.warn('⚠️ Proceeding without segment data');
          ridesWithSegments = (allRides || []).map(ride => ({ ...ride, segments: [], ride_segments: [] }));
        }
      } else {
        console.log('ℹ️ No multi-stop rides found, skipping segment fetch');
        ridesWithSegments = (allRides || []).map(ride => ({ ...ride, segments: [], ride_segments: [] }));
      }

      // Separate direct route rides from multi-stop rides
      const directRides = ridesWithSegments.filter(ride => ride.use_direct_route);
      const multiStopRides = ridesWithSegments.filter(ride => !ride.use_direct_route);
      
      console.log('🎯 Ride Categories:');
      console.log(`  - Direct route rides: ${directRides.length}`);
      console.log(`  - Multi-stop rides: ${multiStopRides.length}`);

      const matches: SegmentMatch[] = [];

      // Process direct route rides
      console.log('\n🚗 === PROCESSING DIRECT ROUTE RIDES ===');
      for (let i = 0; i < directRides.length; i++) {
        const ride = directRides[i];
        console.log(`\n🚗 Processing Direct Ride ${i + 1}/${directRides.length} (ID: ${ride.id})`);
        console.log(`  📍 Route: ${ride.from_location} → ${ride.to_location}`);
        console.log(`  🕒 Departure: ${ride.departure_time}`);
        console.log(`  💺 Available seats: ${ride.available_seats}/${ride.total_seats}`);
        console.log(`  🎯 Search target: ${searchParams.fromLocation} → ${searchParams.toLocation}`);

        // Location matching for direct routes
        const normalizeLocation = (location: string) => {
          return location.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        };

        const searchFrom = normalizeLocation(searchParams.fromLocation);
        const searchTo = normalizeLocation(searchParams.toLocation);
        const rideFrom = normalizeLocation(ride.from_location);
        const rideTo = normalizeLocation(ride.to_location);

        // Multiple matching strategies for better results
        const exactFromMatch = searchFrom === rideFrom;
        const exactToMatch = searchTo === rideTo;
        const containsFromMatch = rideFrom.includes(searchFrom) || searchFrom.includes(rideFrom);
        const containsToMatch = rideTo.includes(searchTo) || searchTo.includes(rideTo);
        
        // First word matching for city names
        const firstWordFromSearch = searchFrom.split(' ')[0];
        const firstWordFromRide = rideFrom.split(' ')[0];
        const firstWordToSearch = searchTo.split(' ')[0];
        const firstWordToRide = rideTo.split(' ')[0];
        const firstWordFromMatch = firstWordFromSearch === firstWordFromRide && firstWordFromSearch.length > 2;
        const firstWordToMatch = firstWordToSearch === firstWordToRide && firstWordToSearch.length > 2;

        const fromMatches = exactFromMatch || containsFromMatch || firstWordFromMatch;
        const toMatches = exactToMatch || containsToMatch || firstWordToMatch;

        console.log('    🔍 Location Analysis:');
        console.log('    - FROM matching:', {
          exact: exactFromMatch,
          contains: containsFromMatch,
          firstWord: firstWordFromMatch,
          result: fromMatches ? '✅' : '❌'
        });
        console.log('    - TO matching:', {
          exact: exactToMatch,
          contains: containsToMatch,
          firstWord: firstWordToMatch,
          result: toMatches ? '✅' : '❌'
        });
        console.log('    - Overall match:', fromMatches && toMatches ? '✅ PASS' : '❌ FAIL');

        console.log(`  🎫 Direct Route Final Check:`);
        console.log('    - Location match:', fromMatches && toMatches);
        console.log('    - Seat availability:', `${ride.available_seats} >= ${searchParams.passengers} = ${ride.available_seats >= searchParams.passengers}`);
        
        if (fromMatches && toMatches && ride.available_seats >= searchParams.passengers) {
          console.log(`    ✅ DIRECT RIDE ${ride.id} QUALIFIES!`);
          // Create a pseudo segment match for direct routes
          const fromSegment = {
            id: 0,
            address: ride.from_location,
            segment_order: 0,
            is_pickup: true,
            lat: ride.from_lat,
            lng: ride.from_lng
          };

          const toSegment = {
            id: 1,
            address: ride.to_location,
            segment_order: 1,
            is_pickup: false,
            lat: ride.to_lat,
            lng: ride.to_lng
          };

          // Calculate real-time ETA for direct routes
          // FIXED: Validate departure_time before creating Date object (already validated in filter above)
          const departureTime = new Date(ride.departure_time);
          let estimatedDropoffTime: Date;
          let realTimeETA = false;
          let actualDistance: number | undefined;
          let actualDuration: number | undefined;

          try {
            if (ride.from_lat && ride.from_lng && ride.to_lat && ride.to_lng) {
              console.log('🗺️ Calculating real-time routing for direct ride...');
              const routeInfo = await getRouteInfo(
                { lat: ride.from_lat, lng: ride.from_lng },
                { lat: ride.to_lat, lng: ride.to_lng }
              );
              
              if (routeInfo) {
                estimatedDropoffTime = new Date(departureTime.getTime() + routeInfo.duration * 60 * 1000);
                realTimeETA = true;
                actualDistance = routeInfo.distance;
                actualDuration = routeInfo.duration;
                console.log(`    ✅ Real-time routing: ${routeInfo.distance}km, ${routeInfo.duration}min`);
              } else {
                estimatedDropoffTime = new Date(departureTime.getTime() + (ride.estimated_duration || 120) * 60 * 1000);
                console.log('    ⚠️ Using estimated duration fallback');
              }
            } else {
              estimatedDropoffTime = new Date(departureTime.getTime() + (ride.estimated_duration || 120) * 60 * 1000);
              console.log('    ⚠️ Missing coordinates, using estimated duration');
            }
          } catch (routeError) {
            console.error('    ❌ Routing failed:', routeError);
            estimatedDropoffTime = new Date(departureTime.getTime() + (ride.estimated_duration || 120) * 60 * 1000);
          }

          // FIXED: Validate both departure and dropoff times before calling toISOString
          try {
            // Additional validation for estimatedDropoffTime
            if (isNaN(estimatedDropoffTime.getTime())) {
              console.warn(`Ride ${ride.id} has invalid estimatedDropoffTime, using fallback`);
              estimatedDropoffTime = new Date(departureTime.getTime() + 2 * 60 * 60 * 1000); // 2 hour fallback
            }

            matches.push({
              ride,
              fromSegment,
              toSegment,
              segmentPrice: ride.price_per_seat,
              estimatedPickupTime: departureTime.toISOString(),
              estimatedDropoffTime: estimatedDropoffTime.toISOString(),
              availableSeats: ride.available_seats,
              realTimeETA,
              actualDistance,
              actualDuration
            });
          } catch (dateError) {
            console.error(`Error converting dates to ISO string for ride ${ride.id}:`, dateError);
            console.warn(`Skipping ride ${ride.id} due to date conversion error`);
          }
          
          console.log(`    💰 Price: $${ride.price_per_seat} per seat`);
          console.log(`    🕒 Pickup: ${departureTime.toLocaleString()}`);
          console.log(`    🏁 Dropoff: ${estimatedDropoffTime.toLocaleString()}`);
        } else {
          console.log(`    ❌ RIDE ${ride.id} DOESN'T QUALIFY`);
          if (!fromMatches || !toMatches) {
            console.log('      - Location mismatch');
          }
          if (ride.available_seats < searchParams.passengers) {
            console.log('      - Insufficient seats');
          }
        }
      }

      // Process multi-stop rides
      console.log('\n🚌 === PROCESSING MULTI-STOP RIDES ===');
      for (let i = 0; i < multiStopRides.length; i++) {
        const ride = multiStopRides[i];
        console.log(`\n🚌 Processing Multi-Stop Ride ${i + 1}/${multiStopRides.length} (ID: ${ride.id})`);
        console.log(`  📍 Main route: ${ride.from_location} → ${ride.to_location}`);
        console.log(`  🕒 Departure: ${ride.departure_time}`);
        console.log(`  🗺️ Segments: ${ride.segments?.length || 0}`);

        if (!ride.segments || ride.segments.length === 0) {
          console.log('    ⚠️ No segments found for multi-stop ride, skipping');
          continue;
        }

        // Sort segments by order
        const sortedSegments = ride.segments.sort((a, b) => a.segment_order - b.segment_order);
        console.log('    📋 Segment details:', sortedSegments.map(s => `${s.segment_order}: ${s.address} (${s.is_pickup ? 'pickup' : 'dropoff'})`));

        // Find matching pickup and dropoff segments
        for (let pickupIdx = 0; pickupIdx < sortedSegments.length; pickupIdx++) {
          const pickupSegment = sortedSegments[pickupIdx];
          
          for (let dropoffIdx = pickupIdx + 1; dropoffIdx < sortedSegments.length; dropoffIdx++) {
            const dropoffSegment = sortedSegments[dropoffIdx];
            
            console.log(`\n    🔄 Testing segment combination:`);
            console.log(`      - Pickup: ${pickupSegment.address}`);
            console.log(`      - Dropoff: ${dropoffSegment.address}`);

            // Location matching
            const normalizeLocation = (location: string) => {
              return location.toLowerCase()
                .replace(/[^a-z0-9\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            };

            const searchFrom = normalizeLocation(searchParams.fromLocation);
            const searchTo = normalizeLocation(searchParams.toLocation);
            const segmentFrom = normalizeLocation(pickupSegment.address);
            const segmentTo = normalizeLocation(dropoffSegment.address);

            const exactFromMatch = searchFrom === segmentFrom;
            const exactToMatch = searchTo === segmentTo;
            const containsFromMatch = segmentFrom.includes(searchFrom) || searchFrom.includes(segmentFrom);
            const containsToMatch = segmentTo.includes(searchTo) || searchTo.includes(segmentTo);
            
            const firstWordFromSearch = searchFrom.split(' ')[0];
            const firstWordFromSegment = segmentFrom.split(' ')[0];
            const firstWordToSearch = searchTo.split(' ')[0];
            const firstWordToSegment = segmentTo.split(' ')[0];
            const firstWordFromMatch = firstWordFromSearch === firstWordFromSegment && firstWordFromSearch.length > 2;
            const firstWordToMatch = firstWordToSearch === firstWordToSegment && firstWordToSearch.length > 2;

            const fromMatches = exactFromMatch || containsFromMatch || firstWordFromMatch;
            const toMatches = exactToMatch || containsToMatch || firstWordToMatch;

            console.log('      📍 Location Analysis:');
            console.log('        - FROM matching:', fromMatches ? '✅' : '❌');
            console.log('        - TO matching:', toMatches ? '✅' : '❌');

            if (fromMatches && toMatches && ride.available_seats >= searchParams.passengers) {
              console.log(`      ✅ SEGMENT MATCH FOUND!`);
              
              // Calculate segment price and ETA
              let segmentPrice = ride.price_per_seat;
              let estimatedPickupTime = ride.departure_time;
              let estimatedDropoffTime = ride.departure_time;
              let realTimeETA = false;
              let actualDistance: number | undefined;
              let actualDuration: number | undefined;

              try {
                // Calculate segment-specific pricing if coordinates are available
                if (ride.segments.every(s => s.lat && s.lng)) {
                  console.log('      💰 Calculating segment pricing...');
                  const allCoords = sortedSegments.map(s => ({ lat: s.lat!, lng: s.lng! }));
                  const pricingResult = await calculateSegmentPriceFromCoordinates(
                    ride.price_per_seat,
                    allCoords,
                    pickupIdx,
                    dropoffIdx
                  );
                  
                  if (pricingResult) {
                    segmentPrice = pricingResult.segmentPrice;
                    actualDistance = pricingResult.segmentDistance;
                    console.log(`        ✅ Segment price: $${segmentPrice} (${pricingResult.priceRatio.toFixed(1)}% of full ride)`);
                  }
                }

                // Calculate ETAs for segments
                if (ride.segments.every(s => s.lat && s.lng)) {
                  console.log('      🕒 Calculating segment ETAs...');
                  const allCoords = sortedSegments.map(s => ({ lat: s.lat!, lng: s.lng! }));
                  
                  // FIXED: Validate departure_time before creating Date object
                  if (!ride.departure_time) {
                    console.warn(`Ride ${ride.id} has null/undefined departure_time, skipping ETA calculation`);
                    continue;
                  }

                  const departureTime = new Date(ride.departure_time);
                  if (isNaN(departureTime.getTime())) {
                    console.warn(`Ride ${ride.id} has invalid departure_time: ${ride.departure_time}, skipping ETA calculation`);
                    continue;
                  }
                  
                  // FIXED: Get route segments first, then calculate ETAs with proper data
                  try {
                    const routeInfo = await getMultiStopRouteInfo(allCoords);
                    if (routeInfo && routeInfo.segments && routeInfo.segments.length > 0) {
                      const etaResult = calculateStopETAs(departureTime, routeInfo.segments);
                      if (etaResult && etaResult.length > dropoffIdx) {
                        // FIXED: Validate ETA dates before calling toISOString
                        const pickupETA = etaResult[pickupIdx];
                        const dropoffETA = etaResult[dropoffIdx];
                        
                        if (pickupETA && pickupETA.eta && !isNaN(pickupETA.eta.getTime()) && 
                            dropoffETA && dropoffETA.eta && !isNaN(dropoffETA.eta.getTime())) {
                          estimatedPickupTime = pickupETA.eta.toISOString();
                          estimatedDropoffTime = dropoffETA.eta.toISOString();
                          realTimeETA = true;
                          console.log(`        ✅ Real-time ETAs calculated`);
                          console.log(`        🕒 Pickup: ${pickupETA.eta.toLocaleString()}`);
                          console.log(`        🏁 Dropoff: ${dropoffETA.eta.toLocaleString()}`);
                        } else {
                          console.log('        ⚠️ Invalid ETA dates returned, using departure time');
                        }
                      } else {
                        console.log('        ⚠️ ETA calculation failed, using departure time');
                      }
                    } else {
                      console.log('        ⚠️ Route calculation failed, using departure time');
                    }
                  } catch (etaError) {
                    console.error('        ❌ Error calculating segment ETAs:', etaError);
                    console.log('        ⚠️ Using departure time fallback');
                  }
                } else {
                  console.log('      ⚠️ Missing coordinates for segment ETA calculation');
                }
              } catch (error) {
                console.error('      ❌ Error calculating segment details:', error);
              }

              matches.push({
                ride,
                fromSegment: pickupSegment,
                toSegment: dropoffSegment,
                segmentPrice,
                estimatedPickupTime,
                estimatedDropoffTime,
                availableSeats: ride.available_seats,
                realTimeETA,
                actualDistance,
                actualDuration
              });
              
              console.log(`      💰 Final price: $${segmentPrice}`);
            } else {
              console.log(`      ❌ No match`);
              if (!fromMatches || !toMatches) {
                console.log('        - Location mismatch');
              }
              if (ride.available_seats < searchParams.passengers) {
                console.log('        - Insufficient seats');
              }
            }
          }
        }
      }

      console.log('\n📊 === FINAL MATCHING RESULTS ===');
      console.log(`🎯 Total matches found: ${matches.length}`);
      console.log(`📍 Search criteria: ${searchParams.fromLocation} → ${searchParams.toLocation}`);
      console.log(`📅 Search date: ${searchParams.date}`);
      console.log(`👥 Passengers: ${searchParams.passengers}`);
      
      if (matches.length > 0) {
        console.log('🚗 Match details:');
        matches.forEach((match, idx) => {
          console.log(`  ${idx + 1}. Ride ${match.ride.id}: $${match.segmentPrice} (${match.realTimeETA ? 'Real-time' : 'Estimated'} ETA)`);
        });
      } else {
        console.log('😢 No rides found matching the search criteria');
      }

      console.log('\n🔚 === ENHANCED SEARCH DEBUG END ===');
      
      // Group matches by date for enhanced UI display
      const grouped = matches.reduce((acc, match) => {
        try {
          // FIXED: Validate departure_time before creating Date object
          if (!match.ride.departure_time) {
            console.warn(`Match ride ${match.ride.id} has null/undefined departure_time, skipping grouping`);
            return acc;
          }

          const departureDate = new Date(match.ride.departure_time);
          if (isNaN(departureDate.getTime())) {
            console.warn(`Match ride ${match.ride.id} has invalid departure_time: ${match.ride.departure_time}, skipping grouping`);
            return acc;
          }

          const rideDate = departureDate.toISOString().split('T')[0];
          if (!acc[rideDate]) {
            acc[rideDate] = [];
          }
          acc[rideDate].push(match);
          return acc;
        } catch (error) {
          console.error(`Error grouping match for ride ${match.ride.id}:`, error);
          return acc; // Skip matches that cause errors
        }
      }, {} as {[date: string]: SegmentMatch[]});
      
      console.log('📊 Grouped Results by Date:');
      Object.entries(grouped).forEach(([date, dateMatches]) => {
        console.log(`  - ${date}: ${dateMatches.length} ride(s)`);
      });
      
      setSegmentMatches(matches);
      setGroupedMatches(grouped);
    } catch (error) {
      console.error('Error finding segment matches:', error);
      setSegmentMatches([]);
      setGroupedMatches({});
    } finally {
      setLoading(false);
    }
  };

  const handleRideSelect = (match: SegmentMatch) => {
    // Navigate to ride details with segment information
    navigate(`/ride/${match.ride.id}`, {
      state: {
        ride: match.ride,
        segmentMatch: {
          fromSegment: match.fromSegment,
          toSegment: match.toSegment,
          segmentPrice: match.segmentPrice,
          estimatedPickupTime: match.estimatedPickupTime,
          estimatedDropoffTime: match.estimatedDropoffTime,
          availableSeats: match.availableSeats,
          realTimeETA: match.realTimeETA,
          actualDistance: match.actualDistance,
          actualDuration: match.actualDuration
        },
        searchParams
      }
    });
  };

  const formatTime = (timeString: string) => {
    return new Date(timeString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Finding rides...</p>
        </div>
      </div>
    );
  }

  if (!searchParams) {
    navigate('/find');
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 text-white overflow-hidden">
        <div className="px-4 pt-8 pb-6">
          {/* Navigation */}
          <div className="flex items-center space-x-4 mb-6">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-2xl font-bold">Available Rides</h1>
          </div>

          {/* Search Summary */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-blue-100">
                {new Date(searchParams.date).toLocaleDateString('en-US', { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric' 
                })} • {searchParams.passengers} passenger{searchParams.passengers > 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                <span className="font-medium">{searchParams.fromLocation}</span>
              </div>
              <div className="border-l-2 border-dashed border-white/30 ml-1.5 h-4 my-1"></div>
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                <span className="font-medium">{searchParams.toLocation}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="px-4 py-6">
        {segmentMatches.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-gray-400 to-gray-500 mb-6">
              <Navigation size={32} className="text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              No rides found
            </h3>
            <p className="text-gray-600 mb-8 max-w-sm mx-auto">
              No rides match your route and schedule. Try adjusting your search or check back later.
            </p>
            <button
              onClick={() => navigate('/find')}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-semibold shadow-lg"
            >
              New Search
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-gray-600 font-medium mb-6">
              Found {segmentMatches.length} ride{segmentMatches.length > 1 ? 's' : ''} matching your route across {Object.keys(groupedMatches).length} day{Object.keys(groupedMatches).length > 1 ? 's' : ''}
            </p>
            
            {/* Group rides by date with date headers */}
            {Object.entries(groupedMatches)
              .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
              .map(([date, dateMatches]) => {
                const dateObj = new Date(date);
                const today = new Date();
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                
                let dateLabel = '';
                if (date === today.toISOString().split('T')[0]) {
                  dateLabel = 'Today';
                } else if (date === tomorrow.toISOString().split('T')[0]) {
                  dateLabel = 'Tomorrow';
                } else {
                  dateLabel = dateObj.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'short', 
                    day: 'numeric' 
                  });
                }
                
                return (
                  <div key={date} className="space-y-4">
                    {/* Date Header */}
                    <div className="flex items-center space-x-4 py-3">
                      <div className="flex-shrink-0">
                        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-xl font-semibold shadow-md">
                          <div className="flex items-center space-x-2">
                            <Calendar size={18} />
                            <span>{dateLabel}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 h-px bg-gradient-to-r from-blue-200 to-purple-200"></div>
                      <div className="text-sm text-gray-500 font-medium bg-gray-100 px-3 py-1 rounded-full">
                        {dateMatches.length} ride{dateMatches.length > 1 ? 's' : ''}
                      </div>
                    </div>
                    
                    {/* Rides for this date */}
                    <div className="space-y-4 pl-4">
                      {dateMatches.map((match, index) => (
                        <div
                          key={`${match.ride.id}-${index}`}
                          onClick={() => handleRideSelect(match)}
                          className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-200 transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
                        >
                          {/* Driver Info */}
                          <div className="flex items-center space-x-3 mb-4">
                            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                              <span className="text-white font-bold text-lg">
                                {match.ride.driver?.display_name?.[0]?.toUpperCase() || 'D'}
                              </span>
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900">
                                {match.ride.driver?.display_name || 'Driver'}
                              </div>
                              <div className="text-sm text-gray-600">
                                ⭐ {match.ride.driver?.rating || '5.0'} • {match.ride.driver?.car_model || 'Car'}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                                ${match.segmentPrice}
                              </div>
                              <div className="text-sm text-gray-500">per person</div>
                            </div>
                          </div>

                          {/* Route Info - Segment Only */}
                          <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <div className="w-4 h-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"></div>
                                  <div>
                                    <div className="font-medium text-gray-900">{match.fromSegment.address}</div>
                                    <div className="text-sm text-gray-600">Pickup • {formatTime(match.estimatedPickupTime)}</div>
                                  </div>
                                </div>
                                {match.realTimeETA && (
                                  <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
                                    Live ETA
                                  </span>
                                )}
                              </div>
                              
                              <div className="border-l-2 border-dashed border-gray-300 ml-2 h-8 flex items-center">
                                <div className="ml-4 text-sm text-gray-500">
                                  {match.actualDistance ? `${match.actualDistance.toFixed(1)} km` : 'Route segment'}
                                  {match.actualDuration ? ` • ${Math.round(match.actualDuration)} min` : ''}
                                </div>
                              </div>
                              
                              <div className="flex items-center space-x-3">
                                <div className="w-4 h-4 bg-gradient-to-r from-red-500 to-pink-500 rounded-full"></div>
                                <div>
                                  <div className="font-medium text-gray-900">{match.toSegment.address}</div>
                                  <div className="text-sm text-gray-600">Dropoff • {formatTime(match.estimatedDropoffTime)}</div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Ride Details */}
                          <div className="flex items-center justify-between text-sm text-gray-600">
                            <div className="flex items-center space-x-4">
                              <div className="flex items-center space-x-1">
                                <Users size={16} />
                                <span>{match.availableSeats} seats available</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Clock size={16} />
                                <span>{formatTime(match.ride.departure_time)}</span>
                              </div>
                            </div>
                            <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                              {match.ride.use_direct_route ? 'Direct Route' : 'Multi-Stop'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AvailableRidesPage;