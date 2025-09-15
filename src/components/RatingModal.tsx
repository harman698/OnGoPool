import React, { useState, useEffect } from 'react';
import { X, Star, User, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: number;
  ratedUserId: string;
  ratedUserName: string;
  ratedUserPhoto?: string;
  ratingType: 'driver_to_passenger' | 'passenger_to_driver';
  onRatingSubmitted?: () => void;
}

const RatingModal: React.FC<RatingModalProps> = ({
  isOpen,
  onClose,
  bookingId,
  ratedUserId,
  ratedUserName,
  ratedUserPhoto,
  ratingType,
  onRatingSubmitted
}) => {
  const { user } = useAuthStore();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingRating, setExistingRating] = useState<any>(null);

  useEffect(() => {
    if (isOpen && user) {
      checkExistingRating();
    }
  }, [isOpen, user, bookingId, ratedUserId, ratingType]);

  const checkExistingRating = async () => {
    try {
      const { data, error } = await supabase
        .from('ratings')
        .select('*')
        .eq('booking_id', bookingId)
        .eq('rater_id', user!.id)
        .eq('rated_user_id', ratedUserId)
        .eq('rating_type', ratingType)
        .single();

      if (data) {
        setExistingRating(data);
        setRating(data.rating);
        setComment(data.comment || '');
      } else if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Error checking existing rating:', error);
      }
    } catch (error) {
      console.error('Error checking existing rating:', error);
    }
  };

  const submitRating = async () => {
    if (!user || rating === 0) return;

    setLoading(true);
    try {
      const ratingData = {
        booking_id: bookingId,
        rater_id: user.id,
        rated_user_id: ratedUserId,
        rating,
        comment: comment.trim() || null,
        rating_type: ratingType,
        created_at: new Date().toISOString()
      };

      let result;
      if (existingRating) {
        // Update existing rating
        result = await supabase
          .from('ratings')
          .update({
            rating,
            comment: comment.trim() || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRating.id);
      } else {
        // Create new rating
        result = await supabase
          .from('ratings')
          .insert(ratingData);
      }

      if (result.error) throw result.error;

      onRatingSubmitted?.();
      onClose();
      
      // Show success message
      const action = existingRating ? 'updated' : 'submitted';
      alert(`Rating ${action} successfully!`);
    } catch (error: any) {
      console.error('Error submitting rating:', error);
      alert(`Failed to submit rating: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setRating(0);
    setHoverRating(0);
    setComment('');
    setExistingRating(null);
    onClose();
  };

  if (!isOpen) return null;

  const isDriver = ratingType === 'driver_to_passenger';
  const title = isDriver ? 'Rate Your Passenger' : 'Rate Your Driver';
  const subtitle = isDriver ? 
    'How was your experience with this passenger?' : 
    'How was your ride experience?';

  const ratingLabels = {
    1: 'Poor',
    2: 'Fair',
    3: 'Good',
    4: 'Very Good',
    5: 'Excellent'
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600">{subtitle}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* User Info */}
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
              {ratedUserPhoto ? (
                <img
                  src={ratedUserPhoto}
                  alt={ratedUserName}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <User size={24} className="text-white" />
              )}
            </div>
            <div>
              <h4 className="font-bold text-gray-900 text-lg">{ratedUserName}</h4>
              <p className="text-sm text-gray-600">
                {isDriver ? 'Passenger' : 'Driver'}
              </p>
            </div>
          </div>

          {/* Star Rating */}
          <div className="text-center">
            <div className="flex justify-center space-x-2 mb-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="transition-colors hover:scale-110 transform"
                >
                  <Star
                    size={32}
                    className={`${
                      star <= (hoverRating || rating)
                        ? 'text-yellow-500 fill-current'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            {(rating > 0 || hoverRating > 0) && (
              <p className="text-sm font-medium text-gray-700">
                {ratingLabels[(hoverRating || rating) as keyof typeof ratingLabels]}
              </p>
            )}
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comment (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={`Share your experience with ${ratedUserName}...`}
              rows={3}
              maxLength={500}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              {comment.length}/500 characters
            </p>
          </div>

          {/* Existing Rating Notice */}
          {existingRating && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center space-x-2">
                <MessageCircle size={16} className="text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  You've already rated this {isDriver ? 'passenger' : 'driver'}. 
                  Any changes will update your previous rating.
                </span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex space-x-3">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submitRating}
              disabled={loading || rating === 0}
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white px-4 py-3 rounded-xl font-semibold transition-all duration-200 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : existingRating ? 'Update Rating' : 'Submit Rating'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RatingModal;