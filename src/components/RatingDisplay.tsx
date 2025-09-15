import React from 'react';
import { Star, MessageCircle } from 'lucide-react';

interface RatingDisplayProps {
  rating?: number;
  totalRatings?: number;
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const RatingDisplay: React.FC<RatingDisplayProps> = ({
  rating = 0,
  totalRatings = 0,
  showDetails = false,
  size = 'md',
  className = ''
}) => {
  const displayRating = () => {
    if (!rating || rating === 0) {
      return totalRatings === 0 ? 'New User' : '0.0';
    }
    return Number(rating).toFixed(1);
  };

  const starSize = {
    sm: 14,
    md: 16,
    lg: 20
  };

  const textSize = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  const getRatingColor = (rating: number) => {
    if (rating === 0) return 'text-gray-500';
    if (rating >= 4.5) return 'text-green-600';
    if (rating >= 4.0) return 'text-yellow-600';
    if (rating >= 3.0) return 'text-orange-600';
    return 'text-red-600';
  };

  const getRatingBadgeColor = (rating: number) => {
    if (rating === 0) return 'bg-gray-100 text-gray-600';
    if (rating >= 4.5) return 'bg-green-100 text-green-800';
    if (rating >= 4.0) return 'bg-yellow-100 text-yellow-800';
    if (rating >= 3.0) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  if (showDetails) {
    return (
      <div className={`${className}`}>
        <div className="flex items-center space-x-3">
          {/* Star Rating */}
          <div className="flex items-center space-x-1">
            <Star
              size={starSize[size]}
              className={`${
                rating > 0 ? 'text-yellow-500 fill-current' : 'text-gray-300'
              }`}
            />
            <span className={`font-semibold ${textSize[size]} ${getRatingColor(rating)}`}>
              {displayRating()}
            </span>
          </div>

          {/* Rating Badge */}
          {totalRatings > 0 && (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRatingBadgeColor(rating)}`}>
              {totalRatings} rating{totalRatings !== 1 ? 's' : ''}
            </span>
          )}

          {/* New User Badge */}
          {totalRatings === 0 && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              New User
            </span>
          )}
        </div>

        {/* Rating Description */}
        {rating > 0 && (
          <div className="mt-1">
            <span className={`text-xs ${getRatingColor(rating)} font-medium`}>
              {rating >= 4.5 ? 'Excellent' :
               rating >= 4.0 ? 'Very Good' :
               rating >= 3.0 ? 'Good' :
               rating >= 2.0 ? 'Fair' : 'Poor'}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Simple inline rating display
  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <Star
        size={starSize[size]}
        className={`${
          rating > 0 ? 'text-yellow-500 fill-current' : 'text-gray-300'
        }`}
      />
      <span className={`font-medium ${textSize[size]} ${getRatingColor(rating)}`}>
        {displayRating()}
      </span>
      {totalRatings > 0 && (
        <span className={`text-xs text-gray-500`}>
          ({totalRatings})
        </span>
      )}
    </div>
  );
};

export default RatingDisplay;