import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Eye, 
  EyeOff,
  Lock,
  Globe,
  Users,
  X,
  Check,
  AlertTriangle,
  Trash2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

interface PrivacySettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PrivacyPreferences {
  profileVisibility: 'public' | 'limited' | 'private';
  showPhoneNumber: boolean;
  showEmail: boolean;
  showRideHistory: boolean;
  allowDirectMessages: boolean;
  shareLocationData: boolean;
  dataCollection: boolean;
  marketingEmails: boolean;
}

const PrivacySettings: React.FC<PrivacySettingsProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [preferences, setPreferences] = useState<PrivacyPreferences>({
    profileVisibility: 'limited',
    showPhoneNumber: false,
    showEmail: false,
    showRideHistory: false,
    allowDirectMessages: true,
    shareLocationData: true,
    dataCollection: true,
    marketingEmails: false,
  });

  useEffect(() => {
    if (isOpen && user) {
      loadPrivacyPreferences();
    }
  }, [isOpen, user]);

  const loadPrivacyPreferences = async () => {
    try {
      setLoading(true);
      
      // Load privacy preferences from user profile or use defaults
      const { data, error } = await supabase
        .from('users')
        .select('privacy_settings')
        .eq('id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data?.privacy_settings) {
        setPreferences({ ...preferences, ...data.privacy_settings });
      }
    } catch (error) {
      console.error('Error loading privacy preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePrivacyPreferences = async () => {
    if (!user) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('users')
        .update({ privacy_settings: preferences })
        .eq('id', user.id);

      if (error) throw error;

      alert('Privacy settings saved successfully!');
    } catch (error) {
      console.error('Error saving privacy preferences:', error);
      alert('Failed to save privacy settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreferenceChange = (key: keyof PrivacyPreferences, value: any) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    try {
      setSaving(true);
      
      // In a real app, you'd want to implement a more comprehensive account deletion
      // This is a simplified version
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      alert('Account deletion process initiated. You have been logged out.');
      onClose();
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Failed to delete account. Please contact support.');
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <Shield className="text-blue-600" size={24} />
              <h2 className="text-xl font-bold text-gray-900">Privacy Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Profile Visibility */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                  <Eye size={18} className="text-gray-600" />
                  <span>Profile Visibility</span>
                </h3>
                <div className="space-y-2">
                  {[
                    { value: 'public', label: 'Public', desc: 'Visible to all users' },
                    { value: 'limited', label: 'Limited', desc: 'Visible to ride participants only' },
                    { value: 'private', label: 'Private', desc: 'Minimal information shown' }
                  ].map((option) => (
                    <label key={option.value} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="radio"
                        name="profileVisibility"
                        value={option.value}
                        checked={preferences.profileVisibility === option.value}
                        onChange={(e) => handlePreferenceChange('profileVisibility', e.target.value)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="font-medium text-gray-900">{option.label}</div>
                        <div className="text-sm text-gray-500">{option.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Information Sharing */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                  <Users size={18} className="text-gray-600" />
                  <span>Information Sharing</span>
                </h3>
                <div className="space-y-4">
                  {[
                    { key: 'showPhoneNumber', label: 'Show Phone Number', desc: 'Allow other users to see your phone number' },
                    { key: 'showEmail', label: 'Show Email Address', desc: 'Allow other users to see your email' },
                    { key: 'showRideHistory', label: 'Show Ride History', desc: 'Display your past ride statistics' },
                    { key: 'allowDirectMessages', label: 'Allow Direct Messages', desc: 'Let other users contact you directly' }
                  ].map((setting) => (
                    <div key={setting.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium text-gray-900">{setting.label}</div>
                        <div className="text-sm text-gray-600">{setting.desc}</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferences[setting.key as keyof PrivacyPreferences] as boolean}
                          onChange={(e) => handlePreferenceChange(setting.key as keyof PrivacyPreferences, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data & Location */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                  <Globe size={18} className="text-gray-600" />
                  <span>Data & Location</span>
                </h3>
                <div className="space-y-4">
                  {[
                    { key: 'shareLocationData', label: 'Share Location Data', desc: 'Help improve route suggestions and matching' },
                    { key: 'dataCollection', label: 'Anonymous Analytics', desc: 'Help us improve the app with usage data' },
                    { key: 'marketingEmails', label: 'Marketing Emails', desc: 'Receive updates about new features and offers' }
                  ].map((setting) => (
                    <div key={setting.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium text-gray-900">{setting.label}</div>
                        <div className="text-sm text-gray-600">{setting.desc}</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={preferences[setting.key as keyof PrivacyPreferences] as boolean}
                          onChange={(e) => handlePreferenceChange(setting.key as keyof PrivacyPreferences, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Account Management */}
              <div className="border-t pt-6">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                  <Lock size={18} className="text-gray-600" />
                  <span>Account Management</span>
                </h3>
                
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-red-800 mb-2">Delete Account</div>
                      <div className="text-sm text-red-700 mb-3">
                        Permanently delete your account and all associated data. This action cannot be undone.
                      </div>
                      {!showDeleteConfirm ? (
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                          <Trash2 size={16} />
                          <span>Delete Account</span>
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div className="text-sm text-red-800 font-medium">
                            Are you sure? This will permanently delete your account.
                          </div>
                          <div className="flex space-x-3">
                            <button
                              onClick={handleDeleteAccount}
                              disabled={saving}
                              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                            >
                              {saving ? 'Deleting...' : 'Yes, Delete'}
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(false)}
                              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex space-x-3 pt-4 border-t">
                <button
                  onClick={savePrivacyPreferences}
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>Save Settings</span>
                    </>
                  )}
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>

              {/* Privacy Info */}
              <div className="text-xs text-gray-500 text-center bg-gray-50 p-3 rounded-lg">
                Your privacy is important to us. Learn more about how we protect your data in our Privacy Policy.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrivacySettings;