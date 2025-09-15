import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import NotificationService from '../lib/notificationService';

export const useNotifications = () => {
  const { user } = useAuthStore();
  const notificationService = NotificationService.getInstance();
  const subscriptionsRef = useRef<any>(null);

  useEffect(() => {
    if (user && notificationService.isEnabled()) {
      // Setup real-time notification listeners
      const subscriptions = notificationService.setupRealTimeNotifications(user.id);
      subscriptionsRef.current = subscriptions;

      // Handle service worker messages
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      }

      return () => {
        // Cleanup subscriptions
        if (subscriptionsRef.current) {
          Object.values(subscriptionsRef.current).forEach((channel: any) => {
            if (channel && typeof channel.unsubscribe === 'function') {
              channel.unsubscribe();
            }
          });
        }

        // Remove service worker listener
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
        }
      };
    }
  }, [user, notificationService.isEnabled()]);

  const handleServiceWorkerMessage = (event: MessageEvent) => {
    const { type, payload } = event.data;

    switch (type) {
      case 'ACCEPT_RIDE_REQUEST':
        // Handle ride request acceptance from notification
        handleAcceptRideRequest(payload.rideId);
        break;
      case 'OPEN_CHAT':
        // Navigate to chat page
        window.location.href = `/chat/${payload.rideId}`;
        break;
      case 'NAVIGATE':
        // Navigate to specific URL
        window.location.href = payload.url;
        break;
      case 'MARK_MESSAGE_SEEN':
        // Mark message as seen
        handleMarkMessageSeen(payload.rideId);
        break;
      case 'SYNC_OFFLINE_MESSAGES':
        // Sync messages when back online
        handleSyncOfflineMessages();
        break;
      default:
        console.log('Unknown service worker message:', type);
    }
  };

  const handleAcceptRideRequest = async (rideId: string) => {
    try {
      // Implementation for accepting ride request
      // This would call your existing ride acceptance logic
      console.log('Accepting ride request:', rideId);
    } catch (error) {
      console.error('Error accepting ride request:', error);
    }
  };

  const handleMarkMessageSeen = async (rideId: string) => {
    try {
      // Implementation for marking messages as seen
      // This would update the message status in your database
      console.log('Marking messages as seen for ride:', rideId);
    } catch (error) {
      console.error('Error marking messages as seen:', error);
    }
  };

  const handleSyncOfflineMessages = async () => {
    try {
      // Implementation for syncing offline messages
      // This would fetch and send any queued messages
      console.log('Syncing offline messages');
    } catch (error) {
      console.error('Error syncing offline messages:', error);
    }
  };

  return {
    notificationService,
    isSupported: notificationService.isSupported(),
    isEnabled: notificationService.isEnabled(),
    permission: notificationService.getPermissionStatus()
  };
};

export default useNotifications;