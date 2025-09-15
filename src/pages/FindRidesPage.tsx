import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Calendar, Users, Navigation } from 'lucide-react';
import AddressAutocomplete from '../components/AddressAutocomplete';

const FindRidesPage: React.FC = () => {
  const navigate = useNavigate();
  
  // Set default date to today - using proper timezone handling
  const getCurrentDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [searchData, setSearchData] = useState({
    fromLocation: '',
    toLocation: '',
    date: getCurrentDate(), // Set today as default
    passengers: 1,
  });
  const [fromCoords, setFromCoords] = useState<{ lat: number; lng: number } | undefined>();
  const [toCoords, setToCoords] = useState<{ lat: number; lng: number } | undefined>();

  const handleSearch = () => {
    console.log('🚀 === INITIATING RIDE SEARCH ===');
    console.log('📝 Search Form Validation:');
    console.log('  - From location:', searchData.fromLocation || '❌ MISSING');
    console.log('  - To location:', searchData.toLocation || '❌ MISSING');
    console.log('  - Date:', searchData.date || '❌ MISSING');
    console.log('  - Passengers:', searchData.passengers);
    console.log('  - From coordinates:', fromCoords);
    console.log('  - To coordinates:', toCoords);
    
    if (!searchData.fromLocation || !searchData.toLocation || !searchData.date) {
      console.warn('❌ Search validation failed - missing required fields');
      alert('Please fill in all search fields');
      return;
    }

    console.log('✅ Search validation passed - navigating to results page');
    console.log('📦 Search parameters being passed:');
    const searchParams = {
      fromLocation: searchData.fromLocation,
      toLocation: searchData.toLocation,
      fromCoords,
      toCoords,
      date: searchData.date,
      passengers: searchData.passengers,
    };
    console.log(searchParams);

    // Navigate to available rides page with search parameters
    navigate('/available-rides', {
      state: searchParams
    });
    
    console.log('🔄 Navigation initiated to /available-rides');
  };

  const handleFromLocationChange = (value: string, coordinates?: { lat: number; lng: number }) => {
    setSearchData(prev => ({ ...prev, fromLocation: value }));
    setFromCoords(coordinates);
  };

  const handleToLocationChange = (value: string, coordinates?: { lat: number; lng: number }) => {
    setSearchData(prev => ({ ...prev, toLocation: value }));
    setToCoords(coordinates);
  };

  const todayString = getCurrentDate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 text-white">
        <div className="px-4 pt-12 pb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold truncate">Find a Ride</h1>
              <p className="text-blue-100 text-sm mt-1">Search for available rides in your area</p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 flex-shrink-0 ml-4">
              <Navigation size={32} className="text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Search Form */}
      <div className="px-4 -mt-4">
        <div className="bg-white rounded-3xl shadow-2xl p-6 space-y-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Where do you want to go?</h2>
          
          {/* From Location */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">
              From
            </label>
            <AddressAutocomplete
              value={searchData.fromLocation}
              onChange={handleFromLocationChange}
              placeholder="Enter pickup location"
              className="w-full"
            />
          </div>

          {/* To Location */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700">
              To
            </label>
            <AddressAutocomplete
              value={searchData.toLocation}
              onChange={handleToLocationChange}
              placeholder="Enter destination"
              className="w-full"
            />
          </div>

          {/* Date and Passengers Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="date"
                  value={searchData.date}
                  min={todayString}
                  onChange={(e) => setSearchData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">
                Passengers
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <select
                  value={searchData.passengers}
                  onChange={(e) => setSearchData(prev => ({ ...prev, passengers: parseInt(e.target.value) }))}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
                >
                  <option value={1}>1 passenger</option>
                  <option value={2}>2 passengers</option>
                  <option value={3}>3 passengers</option>
                  <option value={4}>4 passengers</option>
                </select>
              </div>
            </div>
          </div>

          {/* Search Button */}
          <button
            onClick={handleSearch}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-4 px-6 rounded-xl font-bold text-lg shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center justify-center space-x-2"
          >
            <Search size={24} />
            <span>Search Rides</span>
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className="px-4 mt-8">
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">How it works</h3>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                1
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Search for rides</h4>
                <p className="text-gray-600 text-sm">Enter your pickup and destination to find matching rides, including partial route segments.</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                2
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Book your segment</h4>
                <p className="text-gray-600 text-sm">Pay only for your specific route segment, not the full ride journey.</p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-green-100 text-green-600 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
                3
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Connect & travel</h4>
                <p className="text-gray-600 text-sm">Chat with your driver and get picked up at your specific stop location.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 mt-6">
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-6 border border-green-100">
          <h3 className="font-bold text-gray-900 mb-3">Popular Routes</h3>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setSearchData(prev => ({ 
                  ...prev, 
                  fromLocation: 'Toronto, Ontario',
                  toLocation: 'Ottawa, Ontario',
                  date: getCurrentDate()
                }));
              }}
              className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 text-left hover:shadow-md transition-shadow"
            >
              <div className="font-semibold text-sm text-gray-900">Toronto → Ottawa</div>
              <div className="text-xs text-gray-600">Popular route</div>
            </button>
            
            <button
              onClick={() => {
                setSearchData(prev => ({ 
                  ...prev, 
                  fromLocation: 'Kitchener, Ontario',
                  toLocation: 'London, Ontario',
                  date: getCurrentDate()
                }));
              }}
              className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 text-left hover:shadow-md transition-shadow"
            >
              <div className="font-semibold text-sm text-gray-900">Kitchener → London</div>
              <div className="text-xs text-gray-600">With stops</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FindRidesPage;