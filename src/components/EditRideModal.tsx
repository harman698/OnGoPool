import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, AlertCircle, Save, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Ride } from '../types';

interface EditRideModalProps {
  ride: Ride;
  isOpen: boolean;
  onClose: () => void;
  onRideUpdated: () => void;
}

const EditRideModal: React.FC<EditRideModalProps> = ({
  ride,
  isOpen,
  onClose,
  onRideUpdated
}) => {
  const [loading, setLoading] = useState(false);
  const [hasBookings, setHasBookings] = useState(false);
  const [checkingBookings, setCheckingBookings] = useState(true);
  const [formData, setFormData] = useState({
    departureDate: '',
    departureTime: '',
    pricePerSeat: '',
    availableSeats: 1,
    description: ''
  });

  // Check if ride has bookings
  useEffect(() => {
    if (isOpen && ride) {
      checkRideBookings();
      initializeForm();
    }
  }, [isOpen, ride]);

  const checkRideBookings = async () => {
    try {
      setCheckingBookings(true);
      const { data, error } = await supabase
        .from('ride_bookings')
        .select('id, status')
        .eq('ride_id', ride.id)
        .in('status', ['confirmed', 'pending']);

      if (error) throw error;
      
      setHasBookings((data?.length || 0) > 0);
    } catch (error) {
      console.error('Error checking bookings:', error);
      // Assume has bookings on error for safety
      setHasBookings(true);
    } finally {
      setCheckingBookings(false);
    }
  };

  const initializeForm = () => {
    if (ride) {
      const departureDate = new Date(ride.departure_time);
      
      setFormData({
        departureDate: departureDate.toISOString().split('T')[0],
        departureTime: departureDate.toTimeString().slice(0, 5),
        pricePerSeat: ride.price_per_seat?.toString() || '',
        availableSeats: ride.available_seats || 1,
        description: ride.description || ''
      });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    if (!formData.departureDate || !formData.departureTime) {
      alert('Please fill in all required fields');
      return false;
    }

    const selectedDateTime = new Date(`${formData.departureDate}T${formData.departureTime}`);
    const now = new Date();
    
    if (selectedDateTime <= now) {
      alert('Departure time must be in the future');
      return false;
    }

    if (!hasBookings) {
      if (!formData.pricePerSeat || parseFloat(formData.pricePerSeat) <= 0) {
        alert('Please enter a valid price per seat');
        return false;
      }

      if (formData.availableSeats < 1 || formData.availableSeats > 8) {
        alert('Available seats must be between 1 and 8');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    try {
      setLoading(true);

      const departureDateTime = new Date(`${formData.departureDate}T${formData.departureTime}`);
      
      // Prepare update data
      const updateData: any = {
        departure_time: departureDateTime.toISOString(),
        updated_at: new Date().toISOString()
      };

      // If no bookings, allow editing all fields
      if (!hasBookings) {
        updateData.price_per_seat = parseFloat(formData.pricePerSeat);
        updateData.available_seats = formData.availableSeats;
        updateData.description = formData.description.trim();
      }

      const { error } = await supabase
        .from('rides')
        .update(updateData)
        .eq('id', ride.id);

      if (error) throw error;

      alert('Ride updated successfully!');
      onRideUpdated();
      onClose();
    } catch (error) {
      console.error('Error updating ride:', error);
      alert('Failed to update ride. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Edit Trip</h3>
            <p className="text-sm text-gray-600 mt-1">
              {hasBookings ? 'Only date and time can be edited (has bookings)' : 'All fields can be edited (no bookings)'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-full transition-colors shadow-sm"
          >
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        {checkingBookings ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
            <p className="text-gray-600">Checking ride bookings...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Booking Warning */}
            {hasBookings && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-yellow-800 font-medium text-sm">
                      This ride has confirmed bookings
                    </p>
                    <p className="text-yellow-700 text-xs mt-1">
                      Only departure date and time can be modified to avoid disrupting passenger plans.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Date and Time - Always Editable */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="departureDate" className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar size={16} className="inline mr-1" />
                  Date *
                </label>
                <input
                  type="date"
                  id="departureDate"
                  name="departureDate"
                  value={formData.departureDate}
                  onChange={handleInputChange}
                  min={new Date().toISOString().split('T')[0]}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="departureTime" className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock size={16} className="inline mr-1" />
                  Time *
                </label>
                <input
                  type="time"
                  id="departureTime"
                  name="departureTime"
                  value={formData.departureTime}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Price and Seats - Only if no bookings */}
            {!hasBookings && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pricePerSeat" className="block text-sm font-medium text-gray-700 mb-2">
                      Price per Seat ($) *
                    </label>
                    <input
                      type="number"
                      id="pricePerSeat"
                      name="pricePerSeat"
                      value={formData.pricePerSeat}
                      onChange={handleInputChange}
                      min="1"
                      max="200"
                      step="0.01"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="availableSeats" className="block text-sm font-medium text-gray-700 mb-2">
                      <Users size={16} className="inline mr-1" />
                      Available Seats *
                    </label>
                    <select
                      id="availableSeats"
                      name="availableSeats"
                      value={formData.availableSeats}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                    Additional Notes
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    maxLength={500}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    placeholder="Any additional information for passengers..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.description.length}/500 characters
                  </p>
                </div>
              </>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-xl font-medium transition-all duration-200"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white py-3 px-4 rounded-xl font-medium transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default EditRideModal;