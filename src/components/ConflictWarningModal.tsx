import React from 'react';
import { X, AlertTriangle, Clock, Route } from 'lucide-react';
import { ConflictCheckResult, rideConflictService } from '../lib/rideConflictService';

interface ConflictWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflictResult: ConflictCheckResult;
  onProceedAnyway?: () => void;
  showProceedOption?: boolean;
}

const ConflictWarningModal: React.FC<ConflictWarningModalProps> = ({
  isOpen,
  onClose,
  conflictResult,
  onProceedAnyway,
  showProceedOption = false,
}) => {
  if (!isOpen || !conflictResult.conflict_exists) return null;

  const conflicts = rideConflictService.getConflictDetails(conflictResult);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="bg-red-100 p-2 rounded-full">
              <AlertTriangle className="text-red-600" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Schedule Conflict</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Main message */}
        <div className="mb-6">
          <p className="text-gray-700 mb-4">
            You already have {conflicts.length === 1 ? 'a ride' : `${conflicts.length} rides`} scheduled during this time. 
            Drivers cannot have overlapping rides.
          </p>
        </div>

        {/* Conflict details */}
        <div className="space-y-3 mb-6">
          {conflicts.map((conflict, index) => (
            <div key={conflict.ride_id} className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="bg-red-100 p-1 rounded">
                  <Route className="text-red-600" size={16} />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 mb-1">
                    {conflict.from_location} → {conflict.to_location}
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <Clock size={14} />
                    <span>
                      {rideConflictService.formatTimeForDisplay(conflict.departure_time)} - {' '}
                      {rideConflictService.formatTimeForDisplay(conflict.end_time)}
                    </span>
                  </div>
                  <div className="text-xs text-red-600 mt-1 capitalize">
                    {conflict.overlap_type.replace(/_/g, ' ')} overlap
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Suggestions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-blue-900 mb-2">What you can do:</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Choose a different departure time</li>
            <li>• Schedule the ride for a different day</li>
            <li>• Cancel or reschedule your existing ride if needed</li>
          </ul>
        </div>

        {/* Action buttons */}
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 bg-blue-500 text-white py-3 px-4 rounded-xl font-medium hover:bg-blue-600 transition-colors"
          >
            Choose Different Time
          </button>
          {showProceedOption && onProceedAnyway && (
            <button
              onClick={onProceedAnyway}
              className="flex-1 bg-gray-500 text-white py-3 px-4 rounded-xl font-medium hover:bg-gray-600 transition-colors"
            >
              Override Conflict
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConflictWarningModal;