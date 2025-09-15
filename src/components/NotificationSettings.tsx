import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  BellOff, 
  MessageSquare, 
  Car, 
  DollarSign, 
  Volume2, 
  VolumeX,
  Check,
  X,
  Settings,
  Shield
} from 'lucide-react';
import NotificationService, { NotificationSettings as INotificationSettings } from '../lib/notificationService';

interface NotificationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const NotificationSettings: React.FC<NotificationSettingsProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<INotificationSettings>({
    messageNotifications: true,
    rideRequestNotifications: true,
    rideUpdateNotifications: true,
    paymentNotifications: true,
    licenseExpirationNotifications: true,
    supportTicketNotifications: true,
    soundEnabled: true,
  });
  
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  
  const notificationService = NotificationService.getInstance();

  useEffect(() => {
    if (isOpen) {
      setIsSupported(notificationService.isSupported());
      setPermission(notificationService.getPermissionStatus());
      setSettings(notificationService.getSettings());
    }
  }, [isOpen]);

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    try {
      const granted = await notificationService.requestPermission();
      setPermission(granted ? 'granted' : 'denied');
      
      if (granted) {
        // Show a test notification
        await notificationService.showNotification({
          id: 'test-notification',
          title: '🎉 Notifications Enabled!',
          body: 'You\'ll now receive real-time updates for rides, messages, and payments.',
          tag: 'setup-complete'
        });
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleSettingChange = (key: keyof INotificationSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    notificationService.updateSettings(newSettings);
  };

  const testNotification = async (type: string) => {
    switch (type) {
      case 'message':
        await notificationService.showMessageNotification(
          'Sarah Passenger',
          'Thanks for accepting my ride request! What time should I be ready?',
          'test-ride'
        );
        break;
      case 'ride':
        await notificationService.showRideStatusNotification('confirmed', {
          id: 'test-ride',
          from_location: 'Kitchener',
          to_location: 'Toronto'
        });
        break;
      case 'payment':
        await notificationService.showPaymentNotification(32.75, 'received');
        break;
      case 'license':
        await notificationService.showLicenseExpirationNotification(
          'warning',
          new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 25 days from now
          25
        );
        break;
      default:
        await notificationService.showNotification({
          id: 'test-general',
          title: 'OnGoPool Notification',
          body: 'This is a real-time notification showing how updates work across the platform!',
          tag: 'test'
        });
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
              <Bell className="text-blue-600" size={24} />
              <h2 className="text-xl font-bold text-gray-900">Notifications</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* Browser Support Check */}
          {!isSupported && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
              <div className="flex items-center space-x-2">
                <BellOff className="text-yellow-600" size={20} />
                <span className="text-sm text-yellow-800">
                  Your browser doesn't support notifications
                </span>
              </div>
            </div>
          )}

          {/* Permission Status */}
          {isSupported && (
            <div className="mb-6">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-full ${
                    permission === 'granted' ? 'bg-green-100' : 
                    permission === 'denied' ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    {permission === 'granted' ? (
                      <Check className="text-green-600" size={16} />
                    ) : permission === 'denied' ? (
                      <X className="text-red-600" size={16} />
                    ) : (
                      <Bell className="text-gray-600" size={16} />
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {permission === 'granted' ? 'Notifications Enabled' :
                       permission === 'denied' ? 'Notifications Blocked' :
                       'Enable Notifications'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {permission === 'granted' ? 'You\'ll receive all real-time updates' :
                       permission === 'denied' ? 'Please enable in browser settings' :
                       'Get instant updates about rides and messages'}
                    </div>
                  </div>
                </div>
                
                {permission !== 'granted' && permission !== 'denied' && (
                  <button
                    onClick={handleRequestPermission}
                    disabled={isRequesting}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isRequesting ? 'Requesting...' : 'Enable'}
                  </button>
                )}
              </div>

              {permission === 'denied' && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">
                    To enable notifications, click the lock icon in your browser's address bar and allow notifications for this site.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Notification Settings */}
          {permission === 'granted' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 mb-4">Notification Types</h3>
              
              {/* Message Notifications */}
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <MessageSquare className="text-blue-600" size={20} />
                  <div>
                    <div className="font-medium text-gray-900">Messages</div>
                    <div className="text-sm text-gray-600">Real-time chat notifications from drivers and passengers</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => testNotification('message')}
                    className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    Preview
                  </button>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.messageNotifications}
                      onChange={(e) => handleSettingChange('messageNotifications', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* Ride Request Notifications */}
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <Car className="text-green-600" size={20} />
                  <div>
                    <div className="font-medium text-gray-900">Ride Requests</div>
                    <div className="text-sm text-gray-600">Instant notifications for new booking requests on your rides</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => testNotification('ride')}
                    className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                  >
                    Preview
                  </button>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.rideRequestNotifications}
                      onChange={(e) => handleSettingChange('rideRequestNotifications', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                  </label>
                </div>
              </div>

              {/* Ride Updates */}
              <div className="flex items-center justify-between p-4 bg-purple-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <Settings className="text-purple-600" size={20} />
                  <div>
                    <div className="font-medium text-gray-900">Ride Updates</div>
                    <div className="text-sm text-gray-600">Live updates for status changes and trip confirmations</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.rideUpdateNotifications}
                    onChange={(e) => handleSettingChange('rideUpdateNotifications', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {/* Payment Notifications */}
              <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <DollarSign className="text-yellow-600" size={20} />
                  <div>
                    <div className="font-medium text-gray-900">Payments & Earnings</div>
                    <div className="text-sm text-gray-600">Instant alerts for payment processing and earnings updates</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => testNotification('payment')}
                    className="px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                  >
                    Preview
                  </button>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.paymentNotifications}
                      onChange={(e) => handleSettingChange('paymentNotifications', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-600"></div>
                  </label>
                </div>
              </div>

              {/* License Expiration Notifications */}
              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <Shield className="text-orange-600" size={20} />
                  <div>
                    <div className="font-medium text-gray-900">License Expiration</div>
                    <div className="text-sm text-gray-600">Important reminders about driver license renewal deadlines</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => testNotification('license')}
                    className="px-3 py-1 text-xs bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors"
                  >
                    Preview
                  </button>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.licenseExpirationNotifications}
                      onChange={(e) => handleSettingChange('licenseExpirationNotifications', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
                  </label>
                </div>
              </div>

              {/* Sound Settings */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  {settings.soundEnabled ? (
                    <Volume2 className="text-gray-600" size={20} />
                  ) : (
                    <VolumeX className="text-gray-600" size={20} />
                  )}
                  <div>
                    <div className="font-medium text-gray-900">Notification Sounds</div>
                    <div className="text-sm text-gray-600">Play audio alerts with real-time notifications</div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.soundEnabled}
                    onChange={(e) => handleSettingChange('soundEnabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-gray-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gray-600"></div>
                </label>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-200">
            <div className="text-center">
              <button
                onClick={onClose}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                Done
              </button>
            </div>
            
            <div className="mt-4 text-xs text-gray-500 text-center">
              All notifications are processed in real-time and can be customized anytime
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettings;