import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Filter, Calendar, User, MessageCircle, Car, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import RatingDisplay from '../components/RatingDisplay';

interface Rating {
  id: number;
  rating: number;
  comment: string;
  rating_type: 'driver_to_passenger' | 'passenger_to_driver';
  created_at: string;
  rater: {
    id: string;
    display_name: string;
    photo_url?: string;
  };
  rated_user: {
    id: string;
    display_name: string;
    photo_url?: string;
  };
  ride: {
    id: number;
    from_location: string;
    to_location: string;
    departure_time: string;
  };
}

type FilterType = 'all' | 'received' | 'given' | 'as_driver' | 'as_passenger';

const ReviewHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  useEffect(() => {
    if (user) {
      fetchRatings();
    }
  }, [user, filter]);

  const fetchRatings = async () => {
    if (!user) return;

    setLoading(true);
    try {
      let query = supabase
        .from('ratings')
        .select(`
          id,
          rating,
          comment,
          rating_type,
          created_at,
          rater:users!ratings_rater_id_fkey(id, display_name, photo_url),
          rated_user:users!ratings_rated_user_id_fkey(id, display_name, photo_url),
          ride:rides!ratings_ride_id_fkey(id, from_location, to_location, departure_time)
        `);

      // Apply filters
      switch (filter) {
        case 'received':
          query = query.eq('rated_user_id', user.id);
          break;
        case 'given':
          query = query.eq('rater_id', user.id);
          break;
        case 'as_driver':
          query = query.or(`and(rated_user_id.eq.${user.id},rating_type.eq.passenger_to_driver),and(rater_id.eq.${user.id},rating_type.eq.driver_to_passenger)`);
          break;
        case 'as_passenger':
          query = query.or(`and(rated_user_id.eq.${user.id},rating_type.eq.driver_to_passenger),and(rater_id.eq.${user.id},rating_type.eq.passenger_to_driver)`);
          break;
        default: // 'all'
          query = query.or(`rater_id.eq.${user.id},rated_user_id.eq.${user.id}`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setRatings(data || []);
    } catch (error) {
      console.error('Error fetching ratings:', error);
    } finally {
      setLoading(false);
    }
  };

  const extractCityName = (address: string) => {
    if (!address) return address;
    const parts = address.split(',');
    return parts[0].trim();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric',
      month: 'short', 
      day: 'numeric'
    });
  };

  const getFilteredRatings = () => {
    return ratings;
  };

  const getFilterLabel = (filterType: FilterType) => {
    switch (filterType) {
      case 'all': return 'All Reviews';
      case 'received': return 'Reviews Received';
      case 'given': return 'Reviews Given';
      case 'as_driver': return 'As Driver';
      case 'as_passenger': return 'As Passenger';
      default: return 'All Reviews';
    }
  };

  const isReceivedRating = (rating: Rating) => {
    return rating.rated_user.id === user?.id;
  };

  const getOtherUser = (rating: Rating) => {
    return isReceivedRating(rating) ? rating.rater : rating.rated_user;
  };

  const getRoleText = (rating: Rating) => {
    if (isReceivedRating(rating)) {
      return rating.rating_type === 'driver_to_passenger' ? 'From Driver' : 'From Passenger';
    } else {
      return rating.rating_type === 'driver_to_passenger' ? 'To Passenger' : 'To Driver';
    }
  };

  const filteredRatings = getFilteredRatings();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 text-center">Loading reviews...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm shadow-lg px-4 py-4 flex items-center justify-between border-b border-white/20">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <ArrowLeft size={24} className="text-gray-700" />
          </button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Review History
          </h1>
        </div>
        
        <div className="relative">
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="flex items-center space-x-2 px-4 py-2 bg-white/60 backdrop-blur-sm rounded-xl border border-white/30 hover:bg-white/80 transition-colors"
          >
            <Filter size={16} className="text-gray-600" />
            <span className="text-sm font-medium text-gray-700">{getFilterLabel(filter)}</span>
          </button>
          
          {showFilterMenu && (
            <div className="absolute right-0 top-full mt-2 bg-white/90 backdrop-blur-sm rounded-xl shadow-xl border border-white/30 py-2 z-10 min-w-48">
              {(['all', 'received', 'given', 'as_driver', 'as_passenger'] as FilterType[]).map((filterType) => (
                <button
                  key={filterType}
                  onClick={() => {
                    setFilter(filterType);
                    setShowFilterMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors ${
                    filter === filterType ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700'
                  }`}
                >
                  {getFilterLabel(filterType)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-20">
        {filteredRatings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="bg-gradient-to-br from-blue-100 to-purple-100 rounded-3xl p-8 mb-6 shadow-lg">
              <Star size={56} className="text-blue-500 mx-auto" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">No reviews yet</h3>
            <p className="text-gray-600 text-center max-w-sm">
              {filter === 'all' 
                ? 'Complete rides to start giving and receiving reviews.'
                : `No reviews found for "${getFilterLabel(filter)}".`
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRatings.map((rating) => {
              const otherUser = getOtherUser(rating);
              const received = isReceivedRating(rating);
              
              return (
                <div
                  key={rating.id}
                  className={`bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-sm border border-white/30 ${
                    received ? 'border-l-4 border-l-green-400' : 'border-l-4 border-l-blue-400'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-4">
                      {otherUser.photo_url ? (
                        <img
                          src={otherUser.photo_url}
                          alt={otherUser.display_name}
                          className="w-12 h-12 rounded-2xl object-cover shadow-lg"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                          <User size={20} className="text-white" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">
                          {otherUser.display_name}
                        </h3>
                        <p className="text-sm text-gray-600 flex items-center space-x-1">
                          <span>{getRoleText(rating)}</span>
                          <span>•</span>
                          <Calendar size={12} />
                          <span>{formatDate(rating.created_at)}</span>
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <RatingDisplay rating={rating.rating} size="md" />
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        received 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {received ? 'Received' : 'Given'}
                      </span>
                    </div>
                  </div>

                  {/* Rating Stars and Comment */}
                  <div className="mb-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="flex items-center space-x-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={16}
                            className={`${
                              star <= rating.rating
                                ? 'text-yellow-500 fill-current'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        ({rating.rating}/5)
                      </span>
                    </div>
                    
                    {rating.comment && (
                      <div className="bg-gray-50 rounded-xl p-3 border-l-4 border-l-gray-300">
                        <div className="flex items-start space-x-2">
                          <MessageCircle size={16} className="text-gray-500 mt-0.5" />
                          <p className="text-gray-700 text-sm leading-relaxed">
                            "{rating.comment}"
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ride Information */}
                  {rating.ride && (
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="bg-blue-500 rounded-xl p-2">
                            <Car size={16} className="text-white" />
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900 text-sm">Ride Details</h4>
                            <div className="flex items-center space-x-2 text-xs text-gray-600">
                              <MapPin size={12} />
                              <span>
                                {extractCityName(rating.ride.from_location)} → {extractCityName(rating.ride.to_location)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-600">
                            {new Date(rating.ride.departure_time).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats Summary */}
      {filteredRatings.length > 0 && (
        <div className="fixed bottom-20 left-4 right-4 bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-white/30 p-4">
          <div className="flex items-center justify-around">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{filteredRatings.length}</p>
              <p className="text-xs text-gray-600">Total Reviews</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {filteredRatings.filter(r => isReceivedRating(r)).length}
              </p>
              <p className="text-xs text-gray-600">Received</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">
                {filteredRatings.filter(r => !isReceivedRating(r)).length}
              </p>
              <p className="text-xs text-gray-600">Given</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">
                {filteredRatings.length > 0 
                  ? (filteredRatings.reduce((sum, r) => sum + r.rating, 0) / filteredRatings.length).toFixed(1)
                  : '0.0'
                }
              </p>
              <p className="text-xs text-gray-600">Avg Rating</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewHistoryPage;