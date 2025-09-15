// Calculate distance between two coordinates using Haversine formula
export const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371; // Earth's radius in kilometers

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100; // Round to 2 decimal places
};

const toRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

// DEPRECATED: Simple ETA calculation - use calculateRealTimeETAs instead
// Kept for backward compatibility with legacy components
export const calculateETA = (distanceKm: number): number => {
  console.warn('DEPRECATED: calculateETA is deprecated, use calculateRealTimeETAs for accurate results');
  // Assume average speed of 50 km/h for city driving
  const averageSpeed = 50;
  const timeHours = distanceKm / averageSpeed;
  const timeMinutes = timeHours * 60;
  
  return Math.round(timeMinutes);
};

// Calculate price based on distance and base rate (CAD)
export const calculatePrice = (distanceKm: number, baseRatePerKm: number = 0.5): number => {
  const basePrice = distanceKm * baseRatePerKm;
  const minimumPrice = 5; // Minimum fare in CAD
  
  return Math.max(basePrice, minimumPrice);
};

// Enhanced routing with multiple free services for improved reliability
export const getRouteInfo = async (
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
) => {
  // Try multiple routing services in order of preference
  const routingServices = [
    {
      name: 'OSRM',
      url: `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false&alternatives=false&steps=false`,
      parseResponse: (data: any) => {
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          return {
            distance: Math.round(route.distance / 1000 * 100) / 100,
            duration: Math.round(route.duration / 60),
          };
        }
        return null;
      }
    },
    {
      name: 'GraphHopper',
      url: `https://graphhopper.com/api/1/route?point=${fromLat},${fromLng}&point=${toLat},${toLng}&vehicle=car&locale=en&calc_points=false&debug=false&elevation=false&type=json`,
      parseResponse: (data: any) => {
        if (data.paths && data.paths.length > 0) {
          const path = data.paths[0];
          return {
            distance: Math.round(path.distance / 1000 * 100) / 100,
            duration: Math.round(path.time / 60000), // Convert ms to minutes
          };
        }
        return null;
      }
    }
  ];

  // Try each routing service
  for (const service of routingServices) {
    try {
      console.log(`${service.name} API Call:`, service.url);
      
      const response = await fetch(service.url);

      if (response.ok) {
        const data = await response.json();
        console.log(`${service.name} Response:`, data);
        
        const result = service.parseResponse(data);
        if (result) {
          console.log(`${service.name} route calculation result:`, result);
          return result;
        }
      } else {
        console.warn(`${service.name} API returned ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.warn(`Error fetching route from ${service.name}:`, error);
    }
  }

  // All services failed, use fallback calculation
  console.log('All routing services failed, using Haversine fallback');
  const distance = calculateDistance(fromLat, fromLng, toLat, toLng);
  const duration = calculateETA(distance);
  console.log('Fallback calculation used:', { distance, duration });
  
  return {
    distance,
    duration,
  };
};

// Calculate route information for multiple stops
export const getMultiStopRouteInfo = async (
  coordinates: Array<{ lat: number; lng: number }>
): Promise<{
  totalDistance: number;
  totalDuration: number;
  segments: Array<{ distance: number; duration: number; from: number; to: number }>;
}> => {
  console.log('Multi-stop route calculation for coordinates:', coordinates);
  
  if (coordinates.length < 2) {
    console.warn('Insufficient coordinates for route calculation');
    return {
      totalDistance: 0,
      totalDuration: 0,
      segments: [],
    };
  }

  // Check for invalid coordinates (0,0 or null)
  const hasValidCoordinates = coordinates.every(coord => 
    coord.lat !== 0 && coord.lng !== 0 && coord.lat != null && coord.lng != null
  );

  if (!hasValidCoordinates) {
    console.warn('Invalid coordinates detected, using fallback calculation');
    return fallbackMultiStopCalculation(coordinates);
  }

  // Try multiple routing services for multi-stop routes
  const multiStopServices = [
    {
      name: 'OSRM',
      tryRoute: async () => {
        const coordString = coordinates
          .map(coord => `${coord.lng},${coord.lat}`)
          .join(';');

        const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=false&alternatives=false&steps=false`;
        console.log('OSRM Multi-stop API Call:', url);

        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          console.log('OSRM Multi-stop Response:', data);
          
          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const legs = route.legs || [];
            
            const segments = legs.map((leg: any, index: number) => ({
              distance: Math.round(leg.distance / 1000 * 100) / 100,
              duration: Math.round(leg.duration / 60),
              from: index,
              to: index + 1,
            }));

            return {
              totalDistance: Math.round(route.distance / 1000 * 100) / 100,
              totalDuration: Math.round(route.duration / 60),
              segments,
            };
          }
        }
        return null;
      }
    },
    {
      name: 'GraphHopper-Sequential',
      tryRoute: async () => {
        // GraphHopper doesn't support multi-stop directly, so calculate segments sequentially
        const segments = [];
        let totalDistance = 0;
        let totalDuration = 0;

        for (let i = 0; i < coordinates.length - 1; i++) {
          const from = coordinates[i];
          const to = coordinates[i + 1];
          
          try {
            const segmentInfo = await getRouteInfo(from.lat, from.lng, to.lat, to.lng);
            segments.push({
              distance: segmentInfo.distance,
              duration: segmentInfo.duration,
              from: i,
              to: i + 1,
            });
            totalDistance += segmentInfo.distance;
            totalDuration += segmentInfo.duration;
          } catch (error) {
            console.warn(`GraphHopper segment ${i}->${i+1} failed:`, error);
            return null; // If any segment fails, abandon this service
          }
        }

        return {
          totalDistance: Math.round(totalDistance * 100) / 100,
          totalDuration: Math.round(totalDuration),
          segments,
        };
      }
    }
  ];

  // Try each service
  for (const service of multiStopServices) {
    try {
      const result = await service.tryRoute();
      if (result) {
        console.log(`${service.name} Multi-stop result:`, result);
        return result;
      }
    } catch (error) {
      console.warn(`${service.name} multi-stop routing failed:`, error);
    }
  }

  // Fallback: calculate each segment individually using Haversine formula
  return fallbackMultiStopCalculation(coordinates);
};

// Enhanced fallback calculation for multi-stop routes with better estimates
const fallbackMultiStopCalculation = (coordinates: Array<{ lat: number; lng: number }>) => {
  console.log('Using enhanced fallback distance calculation for multi-stop route');
  const segments = [];
  let totalDistance = 0;
  let totalDuration = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const from = coordinates[i];
    const to = coordinates[i + 1];
    
    let distance, duration;
    
    // Check if coordinates are valid and non-zero
    const hasValidCoords = from.lat !== 0 && from.lng !== 0 && to.lat !== 0 && to.lng !== 0 &&
                          !isNaN(from.lat) && !isNaN(from.lng) && !isNaN(to.lat) && !isNaN(to.lng);
    
    if (hasValidCoords) {
      // Use actual coordinate calculation
      distance = calculateDistance(from.lat, from.lng, to.lat, to.lng);
      // Use 50 km/h average speed with 20% buffer for realistic driving
      duration = Math.max(15, Math.round((distance / 50) * 60 * 1.2));
    } else {
      // Use conservative estimates for invalid coordinates
      distance = 75; // 75km between cities (more realistic for Ontario)
      duration = 90; // 90 minutes (more realistic travel time)
    }
    
    segments.push({
      distance,
      duration,
      from: i,
      to: i + 1,
    });
    
    totalDistance += distance;
    totalDuration += duration;
    
    console.log(`Enhanced segment ${i} -> ${i + 1}:`, { 
      distance, 
      duration, 
      hasValidCoords,
      estimatedSpeed: hasValidCoords ? (distance / (duration / 60)).toFixed(1) + ' km/h' : 'N/A'
    });
  }

  const result = {
    totalDistance: Math.round(totalDistance * 100) / 100,
    totalDuration: Math.round(totalDuration),
    segments,
  };
  
  console.log('Enhanced fallback multi-stop result:', result);
  return result;
};

// Calculate ETA for each stop in a multi-stop route
export const calculateStopETAs = (
  departureTime: Date,
  segments: Array<{ duration: number; from: number; to: number }>
): Array<{ stopIndex: number; eta: Date; cumulativeDuration: number }> => {
  // FIXED: Validate that departureTime is actually a Date object
  if (!departureTime || typeof departureTime.getTime !== 'function') {
    console.error('calculateStopETAs: departureTime must be a valid Date object, received:', typeof departureTime, departureTime);
    throw new Error('departureTime must be a valid Date object');
  }

  if (isNaN(departureTime.getTime())) {
    console.error('calculateStopETAs: departureTime is an invalid Date:', departureTime);
    throw new Error('departureTime is an invalid Date');
  }

  const etas = [];
  let cumulativeMinutes = 0;
  
  // Ensure departure time is correctly handled in local timezone
  const baseDepartureTime = new Date(departureTime.getTime());
  console.log('Base departure time for ETA calculation:', baseDepartureTime.toISOString(), 'Local:', baseDepartureTime.toLocaleString());
  
  // First stop is the departure time
  etas.push({
    stopIndex: 0,
    eta: new Date(baseDepartureTime),
    cumulativeDuration: 0,
  });
  
  // Calculate ETA for each subsequent stop
  segments.forEach((segment) => {
    cumulativeMinutes += segment.duration;
    const eta = new Date(baseDepartureTime.getTime() + cumulativeMinutes * 60 * 1000);
    
    console.log(`Stop ${segment.to} ETA calculation:`, {
      cumulativeMinutes,
      etaISO: eta.toISOString(),
      etaLocal: eta.toLocaleString(),
      formattedETA: formatETATime(eta)
    });
    
    etas.push({
      stopIndex: segment.to,
      eta,
      cumulativeDuration: cumulativeMinutes,
    });
  });
  
  return etas;
};

// Validate routing duration to detect unrealistic results
const validateRoutingDuration = (duration: number, distance: number): boolean => {
  // Duration should be in minutes, distance in km
  if (duration <= 0 || distance <= 0) return false;
  
  // Calculate speed: km per hour
  const speed = (distance / (duration / 60));
  
  // Reasonable driving speeds: 10 km/h (traffic jam) to 120 km/h (highway)
  // Reject anything outside this range as likely API error
  if (speed < 5 || speed > 150) {
    console.warn(`Unrealistic speed detected: ${speed.toFixed(1)} km/h (distance: ${distance}km, duration: ${duration}min)`);
    return false;
  }
  
  return true;
};

// Calculate real-time ETA for trip with stops including current traffic conditions
export const calculateRealTimeETAs = async (
  currentTime: Date,
  stops: Array<{ name: string; lat: number; lng: number }>,
  departureTime?: Date
): Promise<Array<{ 
  stopIndex: number; 
  stopName: string; 
  eta: Date; 
  cumulativeDuration: number;
  formattedETA: string;
  isCurrentlyActive: boolean;
}>> => {
  if (stops.length === 0) {
    return [];
  }

  // CRITICAL FIX: Always require departureTime for accurate ETA calculations
  // Never fall back to currentTime as this causes massive ETA inaccuracies
  if (!departureTime) {
    console.error('ETA Calculation Error: departureTime is required for accurate calculations');
    throw new Error('departureTime is required for ETA calculation');
  }

  const baseTime = new Date(departureTime);
  
  // ENHANCED VALIDATION: Check for valid coordinates before proceeding
  const validStops = stops.filter(stop => 
    stop.lat !== 0 && stop.lng !== 0 && 
    stop.lat != null && stop.lng != null &&
    !isNaN(stop.lat) && !isNaN(stop.lng) &&
    Math.abs(stop.lat) <= 90 && Math.abs(stop.lng) <= 180
  );

  if (validStops.length === 0) {
    console.warn('ETA Calculation Warning: No valid coordinates found, using fallback estimates');
    return generateFallbackETAs(baseTime, stops, currentTime);
  }

  const coordinates = validStops.map(stop => ({ lat: stop.lat, lng: stop.lng }));

  try {
    // Enhanced debug logging with proper base time
    console.log('=== ETA Calculation Debug ===');
    console.log('Current Time:', currentTime.toISOString(), '| Local:', currentTime.toLocaleString());
    console.log('Departure Time (required):', baseTime.toISOString(), '| Local:', baseTime.toLocaleString());
    console.log('Valid Stops:', validStops.map(s => ({ name: s.name, lat: s.lat, lng: s.lng })));

    // Get real-time route information from multiple routing services
    const routeInfo = await getMultiStopRouteInfo(coordinates);
    console.log('Multi-service Route Info:', routeInfo);
    
    // Validate routing results for realism
    let validRouting = true;
    if (routeInfo.segments && routeInfo.segments.length > 0) {
      for (const segment of routeInfo.segments) {
        if (!validateRoutingDuration(segment.duration, segment.distance)) {
          console.warn(`Invalid routing segment detected:`, segment);
          validRouting = false;
          break;
        }
      }
    }
    
    if (validRouting && routeInfo.segments && routeInfo.segments.length > 0) {
      // Use actual routing results with valid base time
      const etaData = calculateStopETAs(baseTime, routeInfo.segments);
      console.log('Final ETA Data (from routing):', etaData.map(eta => ({
        stopIndex: eta.stopIndex,
        eta: eta.eta.toISOString(),
        local: eta.eta.toLocaleString(),
        formatted: formatETATime(eta.eta)
      })));
      
      return etaData.map((eta, index) => {
        const stopName = validStops[eta.stopIndex]?.name || `Stop ${eta.stopIndex + 1}`;
        const isActive = currentTime >= eta.eta && (index === etaData.length - 1 || currentTime < etaData[index + 1]?.eta);
        
        return {
          stopIndex: eta.stopIndex,
          stopName,
          eta: eta.eta,
          cumulativeDuration: eta.cumulativeDuration,
          formattedETA: formatETATime(eta.eta),
          isCurrentlyActive: isActive,
        };
      });
    } else {
      console.warn('Routing results invalid or unrealistic, using enhanced fallback calculation');
      return generateFallbackETAs(baseTime, stops, currentTime);
    }
  } catch (error) {
    console.error('Error calculating real-time ETAs:', error);
    console.log('Using enhanced fallback estimation');
    return generateFallbackETAs(baseTime, stops, currentTime);
  }
};

// Generate enhanced fallback ETAs when routing APIs fail or coordinates are invalid
const generateFallbackETAs = (
  baseTime: Date,
  stops: Array<{ name: string; lat: number; lng: number }>,
  currentTime: Date
): Array<{ 
  stopIndex: number; 
  stopName: string; 
  eta: Date; 
  cumulativeDuration: number;
  formattedETA: string;
  isCurrentlyActive: boolean;
}> => {
  console.log('Generating enhanced fallback ETAs');
  
  return stops.map((stop, index) => {
    let estimatedMinutes;
    if (index === 0) {
      estimatedMinutes = 0; // Starting point
    } else {
      // Calculate realistic durations based on typical Canadian highway/city driving
      let segmentDuration = 60; // Default 60 minutes between stops
      
      if (stops.length >= 2) {
        const prevStop = stops[index - 1];
        const currentStop = stops[index];
        
        // Known Ontario route estimates (in minutes)
        const routeEstimates: { [key: string]: number } = {
          'Kitchener-Woodstock': 50,
          'Woodstock-London': 45,
          'London-Windsor': 180,
          'London-Toronto': 120,
          'Toronto-Ottawa': 240,
          'Hamilton-Toronto': 75,
          'Mississauga-Toronto': 45,
          'Cambridge-Kitchener': 20,
          'Guelph-Kitchener': 30,
          'default': 60
        };
        
        // Try to find a matching route
        const routeKey = `${prevStop.name}-${currentStop.name}`;
        const reverseKey = `${currentStop.name}-${prevStop.name}`;
        
        segmentDuration = routeEstimates[routeKey] || routeEstimates[reverseKey] || 
                         routeEstimates['default'];
        
        // Calculate distance-based estimate if coordinates are valid
        if (prevStop.lat && prevStop.lng && currentStop.lat && currentStop.lng &&
            prevStop.lat !== 0 && prevStop.lng !== 0 && 
            currentStop.lat !== 0 && currentStop.lng !== 0) {
          const distance = calculateDistance(prevStop.lat, prevStop.lng, currentStop.lat, currentStop.lng);
          // Use 50 km/h average city speed + 20% buffer for stops/traffic
          const estimatedDuration = Math.max(15, Math.round((distance / 50) * 60 * 1.2));
          
          // Use the more conservative (realistic) of the two estimates
          segmentDuration = Math.min(segmentDuration, estimatedDuration);
        }
      }
      
      // Calculate cumulative time for this stop
      let cumulativeMinutes = 0;
      for (let j = 1; j <= index; j++) {
        if (j === 1) {
          cumulativeMinutes += segmentDuration;
        } else {
          // For additional segments, use a slightly shorter default
          cumulativeMinutes += Math.max(30, segmentDuration * 0.8);
        }
      }
      estimatedMinutes = cumulativeMinutes;
    }
    
    const eta = new Date(baseTime.getTime() + estimatedMinutes * 60 * 1000);
    const isActive = false; // Not tracking real-time during fallback
    
    console.log(`Enhanced fallback ETA for ${stop.name} (index ${index}):`, {
      estimatedMinutes,
      eta: eta.toISOString(),
      formatted: formatETATime(eta)
    });
    
    return {
      stopIndex: index,
      stopName: stop.name,
      eta,
      cumulativeDuration: estimatedMinutes,
      formattedETA: formatETATime(eta),
      isCurrentlyActive: isActive,
    };
  });
};

// Format ETA time in user-friendly format
export const formatETATime = (eta: Date): string => {
  // FIXED: Validate that eta is actually a Date object
  if (!eta || typeof eta.getTime !== 'function') {
    console.error('formatETATime: eta must be a valid Date object, received:', typeof eta, eta);
    return 'Invalid Time';
  }

  if (isNaN(eta.getTime())) {
    console.error('formatETATime: eta is an invalid Date:', eta);
    return 'Invalid Time';
  }

  // Always show actual time format (12:30 PM) for trip planning
  // Ensure proper timezone handling by creating a new date with explicit local timezone
  const localEta = new Date(eta.getTime());
  return localEta.toLocaleTimeString([], { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
};

// Format duration in human-readable format
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${remainingMinutes}m`;
};

// Format distance in human-readable format
export const formatDistance = (km: number): string => {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  
  return `${km}km`;
};

// Calculate segment booking price based on driver's set price and segment distance
export const calculateSegmentPrice = (
  driverPricePerSeat: number,
  totalRideDistance: number,
  segmentDistance: number,
  minimumSegmentPrice: number = 2.00 // Minimum segment price in CAD
): number => {
  // Validate inputs
  if (driverPricePerSeat <= 0 || totalRideDistance <= 0 || segmentDistance <= 0) {
    return minimumSegmentPrice;
  }

  // Calculate proportional price: (segment distance / total distance) * driver's full price
  const proportionalPrice = (segmentDistance / totalRideDistance) * driverPricePerSeat;
  
  // Ensure segment price meets minimum fare and doesn't exceed driver's full price
  const segmentPrice = Math.max(proportionalPrice, minimumSegmentPrice);
  const cappedPrice = Math.min(segmentPrice, driverPricePerSeat);
  
  // Round to 2 decimal places
  return Math.round(cappedPrice * 100) / 100;
};

// Calculate multiple segment pricing for a journey spanning several segments
export const calculateMultiSegmentPrice = (
  driverPricePerSeat: number,
  totalRideDistance: number,
  segmentDistances: number[],
  minimumSegmentPrice: number = 2.00 // Minimum segment price in CAD
): number => {
  // Calculate total distance of all segments in the journey
  const journeyDistance = segmentDistances.reduce((sum, distance) => sum + distance, 0);
  
  // Calculate proportional price for the entire journey
  return calculateSegmentPrice(
    driverPricePerSeat,
    totalRideDistance,
    journeyDistance,
    minimumSegmentPrice
  );
};

// Calculate segment pricing with distance data from coordinates
export const calculateSegmentPriceFromCoordinates = async (
  driverPricePerSeat: number,
  allSegmentCoordinates: Array<{ lat: number; lng: number }>,
  fromSegmentIndex: number,
  toSegmentIndex: number,
  minimumSegmentPrice: number = 2.00 // Minimum segment price in CAD
): Promise<{
  segmentPrice: number;
  totalRideDistance: number;
  segmentDistance: number;
  priceRatio: number;
}> => {
  // Calculate total ride distance
  const { totalDistance: totalRideDistance } = await getMultiStopRouteInfo(allSegmentCoordinates);
  
  // Calculate segment journey distance
  const segmentCoordinates = allSegmentCoordinates.slice(fromSegmentIndex, toSegmentIndex + 1);
  const { totalDistance: segmentDistance } = await getMultiStopRouteInfo(segmentCoordinates);
  
  // Calculate segment price
  const segmentPrice = calculateSegmentPrice(
    driverPricePerSeat,
    totalRideDistance,
    segmentDistance,
    minimumSegmentPrice
  );
  
  // Calculate price ratio for transparency
  const priceRatio = segmentDistance / totalRideDistance;
  
  return {
    segmentPrice,
    totalRideDistance,
    segmentDistance,
    priceRatio: Math.round(priceRatio * 100) / 100, // Round to 2 decimal places
  };
};