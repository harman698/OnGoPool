import { supabase } from './supabase';

export interface NotificationSettings {
  messageNotifications: boolean;
  rideRequestNotifications: boolean;
  rideUpdateNotifications: boolean;
  paymentNotifications: boolean;
  licenseExpirationNotifications: boolean;
  supportTicketNotifications: boolean;
  soundEnabled: boolean;
}

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: any;
  actions?: NotificationAction[];
  requireInteraction?: boolean;
  silent?: boolean;
  timestamp?: number;
}

export class NotificationService {
  private static instance: NotificationService;
  private registration: ServiceWorkerRegistration | null = null;
  private permission: NotificationPermission = 'default';
  private settings: NotificationSettings = {
    messageNotifications: true,
    rideRequestNotifications: true,
    rideUpdateNotifications: true,
    paymentNotifications: true,
    licenseExpirationNotifications: true,
    supportTicketNotifications: true,
    soundEnabled: true,
  };

  private constructor() {
    this.initializeService();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private async initializeService() {
    // Check if browser supports notifications
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return;
    }

    // Check if service worker is supported
    if ('serviceWorker' in navigator) {
      try {
        // Use relative path to work with deployed URLs
        const workerPath = `${window.location.origin}/notification-worker.js`;
        this.registration = await navigator.serviceWorker.register(workerPath, {
          scope: '/'
        });
        console.log('Service Worker registered successfully');
      } catch (error) {
        console.error('Service Worker registration failed:', error);
        // Try fallback path
        try {
          this.registration = await navigator.serviceWorker.register('./notification-worker.js');
          console.log('Service Worker registered with fallback path');
        } catch (fallbackError) {
          console.error('Service Worker fallback registration also failed:', fallbackError);
        }
      }
    }

    // Get current permission status
    this.permission = Notification.permission;

    // Load user settings from localStorage
    this.loadSettings();
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      return false;
    }

    if (this.permission === 'granted') {
      return true;
    }

    const permission = await Notification.requestPermission();
    this.permission = permission;
    
    return permission === 'granted';
  }

  private loadSettings() {
    const savedSettings = localStorage.getItem('notificationSettings');
    if (savedSettings) {
      try {
        this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
      } catch (error) {
        console.error('Error loading notification settings:', error);
      }
    }
  }

  private saveSettings() {
    localStorage.setItem('notificationSettings', JSON.stringify(this.settings));
  }

  updateSettings(newSettings: Partial<NotificationSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
  }

  getSettings(): NotificationSettings {
    return { ...this.settings };
  }

  async showNotification(notification: PushNotification): Promise<boolean> {
    if (this.permission !== 'granted') {
      console.warn('Notification permission not granted');
      return false;
    }

    try {
      const options: NotificationOptions = {
        body: notification.body,
        icon: notification.icon || '/youware-icon-192x192.png',
        badge: notification.badge || '/youware-icon-72x72.png',
        tag: notification.tag || notification.id,
        data: notification.data,
        requireInteraction: notification.requireInteraction || false,
        silent: notification.silent || !this.settings.soundEnabled,
        timestamp: notification.timestamp || Date.now(),
        actions: notification.actions,
      };

      if (this.registration) {
        // Use service worker to show persistent notifications
        await this.registration.showNotification(notification.title, options);
      } else {
        // Fallback to regular notifications
        new Notification(notification.title, options);
      }

      return true;
    } catch (error) {
      console.error('Error showing notification:', error);
      return false;
    }
  }

  // Ride-specific notification methods
  async showRideRequestNotification(rideDetails: any, passengerName: string) {
    if (!this.settings.rideRequestNotifications) return;

    await this.showNotification({
      id: `ride-request-${rideDetails.id}`,
      title: '🚗 New Ride Request',
      body: `${passengerName} wants to join your ride from ${rideDetails.from_location} to ${rideDetails.to_location}`,
      tag: 'ride-request',
      requireInteraction: true,
      data: {
        type: 'ride_request',
        rideId: rideDetails.id,
        url: `/chat/${rideDetails.id}`
      },
      actions: [
        { action: 'accept', title: 'Accept' },
        { action: 'view', title: 'View Details' }
      ]
    });
  }

  async showRideStatusNotification(status: string, rideDetails: any) {
    if (!this.settings.rideUpdateNotifications) return;

    let title = '';
    let body = '';
    let icon = '';

    switch (status) {
      case 'confirmed':
        title = '✅ Ride Confirmed';
        body = `Your ride from ${rideDetails.from_location} to ${rideDetails.to_location} has been confirmed!`;
        icon = '✅';
        break;
      case 'cancelled':
        title = '❌ Ride Cancelled';
        body = `Your ride from ${rideDetails.from_location} to ${rideDetails.to_location} has been cancelled.`;
        icon = '❌';
        break;
      case 'completed':
        title = '🏁 Ride Completed';
        body = `Your ride has been completed. Don't forget to rate your experience!`;
        icon = '🏁';
        break;
      case 'started':
        title = '🚀 Ride Started';
        body = `Your ride has started. Have a safe trip!`;
        icon = '🚀';
        break;
      default:
        title = 'Ride Update';
        body = `Your ride status has been updated to: ${status}`;
    }

    await this.showNotification({
      id: `ride-status-${rideDetails.id}`,
      title,
      body,
      tag: 'ride-update',
      data: {
        type: 'ride_status',
        rideId: rideDetails.id,
        status,
        url: `/trip`
      },
      actions: [
        { action: 'view', title: 'View Trip' }
      ]
    });
  }

  async showMessageNotification(senderName: string, message: string, rideId: string) {
    if (!this.settings.messageNotifications) return;

    await this.showNotification({
      id: `message-${rideId}-${Date.now()}`,
      title: `💬 ${senderName}`,
      body: message.length > 100 ? `${message.substring(0, 97)}...` : message,
      tag: `chat-${rideId}`,
      data: {
        type: 'message',
        rideId,
        url: `/chat/${rideId}`
      },
      actions: [
        { action: 'reply', title: 'Reply' },
        { action: 'view', title: 'View Chat' }
      ]
    });
  }

  async showPaymentNotification(amount: number, type: 'received' | 'paid' | 'pending') {
    if (!this.settings.paymentNotifications) return;

    let title = '';
    let body = '';

    switch (type) {
      case 'received':
        title = '💰 Payment Received';
        body = `You received $${amount.toFixed(2)} for your ride!`;
        break;
      case 'paid':
        title = '💳 Payment Processed';
        body = `Your payment of $${amount.toFixed(2)} has been processed.`;
        break;
      case 'pending':
        title = '⏳ Payment Pending';
        body = `Your payment of $${amount.toFixed(2)} is being processed.`;
        break;
    }

    await this.showNotification({
      id: `payment-${Date.now()}`,
      title,
      body,
      tag: 'payment',
      data: {
        type: 'payment',
        amount,
        url: '/profile'
      },
      actions: [
        { action: 'view', title: 'View Earnings' }
      ]
    });
  }

  async showEarningsNotification(amount: number, rideSummary: string) {
    if (!this.settings.paymentNotifications) return;

    await this.showNotification({
      id: `earnings-${Date.now()}`,
      title: '🎉 Trip Earnings',
      body: `You earned $${amount.toFixed(2)} from ${rideSummary}`,
      tag: 'earnings',
      data: {
        type: 'earnings',
        amount,
        url: '/profile'
      },
      actions: [
        { action: 'view', title: 'View Analytics' }
      ]
    });
  }

  // Support ticket status notification methods
  async showSupportTicketStatusNotification(
    ticketId: number,
    ticketTitle: string,
    oldStatus: string,
    newStatus: string
  ) {
    if (!this.settings.supportTicketNotifications) return;

    let title = '';
    let body = '';
    let icon = '';
    let requireInteraction = false;

    switch (newStatus) {
      case 'in_progress':
        title = '⏳ Ticket In Progress';
        body = `Your support ticket "${ticketTitle}" is now being worked on.`;
        icon = '⏳';
        break;
      case 'resolved':
        title = '✅ Ticket Resolved';
        body = `Your support ticket "${ticketTitle}" has been resolved!`;
        icon = '✅';
        requireInteraction = true;
        break;
      case 'closed':
        title = '📋 Ticket Closed';
        body = `Your support ticket "${ticketTitle}" has been closed.`;
        icon = '📋';
        break;
      default:
        title = '📝 Ticket Updated';
        body = `Your support ticket "${ticketTitle}" status changed to ${newStatus.replace('_', ' ')}.`;
        icon = '📝';
    }

    await this.showNotification({
      id: `support-ticket-${ticketId}-${Date.now()}`,
      title,
      body,
      tag: 'support-ticket',
      requireInteraction,
      data: {
        type: 'support_ticket_status',
        ticketId,
        oldStatus,
        newStatus,
        url: '/profile'
      },
      actions: [
        { action: 'view', title: 'View Tickets' }
      ]
    });
  }

  // Check and process pending support ticket notifications
  async processPendingSupportTicketNotifications(userId: string) {
    if (!this.settings.supportTicketNotifications) return;

    try {
      // Get pending notifications from the database
      const { data: notifications, error } = await supabase
        .rpc('get_pending_support_ticket_notifications', { user_uuid: userId });

      if (error) {
        console.error('Error fetching pending support ticket notifications:', error);
        return;
      }

      if (notifications && notifications.length > 0) {
        // Process each notification
        const notificationIds: number[] = [];
        
        for (const notification of notifications) {
          await this.showSupportTicketStatusNotification(
            notification.ticket_id,
            notification.ticket_title,
            notification.old_status,
            notification.new_status
          );
          
          notificationIds.push(notification.notification_id);
        }

        // Mark notifications as sent
        if (notificationIds.length > 0) {
          await supabase.rpc('mark_support_ticket_notifications_sent', { 
            notification_ids: notificationIds 
          });
        }
      }
    } catch (error) {
      console.error('Error processing pending support ticket notifications:', error);
    }
  }

  // License expiration notification methods
  async showLicenseExpirationNotification(
    urgencyLevel: 'expired' | 'urgent' | 'warning', 
    expirationDate: string, 
    daysUntilExpiry?: number
  ) {
    if (!this.settings.licenseExpirationNotifications) return;

    let title = '';
    let body = '';
    let icon = '';
    let requireInteraction = false;

    const formatDate = (date: string) => new Date(date).toLocaleDateString();

    switch (urgencyLevel) {
      case 'expired':
        title = '🚨 License Expired';
        body = `Your driver's license expired on ${formatDate(expirationDate)}. Please update your license to continue offering rides.`;
        icon = '🚨';
        requireInteraction = true;
        break;
      case 'urgent':
        title = '⚠️ License Expires Soon';
        body = `Your driver's license expires ${daysUntilExpiry === 1 ? 'tomorrow' : `in ${daysUntilExpiry} days`} (${formatDate(expirationDate)}). Please update it soon.`;
        icon = '⚠️';
        requireInteraction = true;
        break;
      case 'warning':
        title = '📅 License Renewal Reminder';
        body = `Your driver's license expires in ${daysUntilExpiry} days (${formatDate(expirationDate)}). Consider renewing it soon.`;
        icon = '📅';
        break;
      default:
        title = 'License Update Reminder';
        body = 'Please check your driver\'s license expiration date.';
    }

    await this.showNotification({
      id: `license-expiry-${urgencyLevel}-${Date.now()}`,
      title,
      body,
      tag: 'license-expiration',
      requireInteraction,
      data: {
        type: 'license_expiration',
        urgencyLevel,
        expirationDate,
        daysUntilExpiry,
        url: '/profile'
      },
      actions: [
        { action: 'update', title: 'Update License' },
        { action: 'view', title: 'View Profile' }
      ]
    });

    // Log the notification to the database
    await this.logLicenseNotification(urgencyLevel, expirationDate, daysUntilExpiry);
  }

  private async logLicenseNotification(
    urgencyLevel: string, 
    expirationDate: string, 
    daysUntilExpiry?: number
  ) {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const notificationType = urgencyLevel === 'expired' ? 'expired' : 
                              daysUntilExpiry === 1 ? 'warning_1' :
                              daysUntilExpiry && daysUntilExpiry <= 7 ? 'warning_7' :
                              'warning_30';

      await supabase
        .from('license_notifications')
        .insert({
          user_id: user.user.id,
          notification_type: notificationType,
          license_expiration_date: expirationDate,
          days_until_expiry: daysUntilExpiry,
          notification_method: 'browser',
          success: true
        });
    } catch (error) {
      console.error('Error logging license notification:', error);
    }
  }

  // Check and show license expiration notifications for a user
  async checkLicenseExpiration(userId: string) {
    if (!this.settings.licenseExpirationNotifications) return;

    try {
      const { data, error } = await supabase
        .rpc('check_license_status', { user_uuid: userId });

      if (error) {
        console.error('Error checking license status:', error);
        return;
      }

      if (data && data.length > 0) {
        const licenseStatus = data[0];
        
        if (licenseStatus.is_expired) {
          await this.showLicenseExpirationNotification(
            'expired',
            licenseStatus.expiration_date,
            Math.abs(licenseStatus.days_until_expiry)
          );
        } else if (licenseStatus.is_expiring_soon) {
          const urgency = licenseStatus.days_until_expiry <= 7 ? 'urgent' : 'warning';
          await this.showLicenseExpirationNotification(
            urgency,
            licenseStatus.expiration_date,
            licenseStatus.days_until_expiry
          );
        }
      }
    } catch (error) {
      console.error('Error checking license expiration:', error);
    }
  }

  // Check if user needs license expiration notification (prevent spam)
  async shouldShowLicenseNotification(userId: string, notificationType: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('license_notifications')
        .select('sent_at')
        .eq('user_id', userId)
        .eq('notification_type', notificationType)
        .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('sent_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error checking license notification history:', error);
        return true; // If we can't check, better to show the notification
      }

      // If no recent notification found, we should show it
      return !data || data.length === 0;
    } catch (error) {
      console.error('Error checking notification history:', error);
      return true;
    }
  }

  // Clear notifications by tag
  clearNotifications(tag: string) {
    if (this.registration) {
      this.registration.getNotifications({ tag }).then(notifications => {
        notifications.forEach(notification => notification.close());
      });
    }
  }

  // Clear all notifications
  clearAllNotifications() {
    if (this.registration) {
      this.registration.getNotifications().then(notifications => {
        notifications.forEach(notification => notification.close());
      });
    }
  }

  // Setup real-time listeners
  setupRealTimeNotifications(userId: string) {
    // Listen for new messages
    const messagesChannel = supabase
      .channel('user-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `ride_id=in.(SELECT id FROM rides WHERE driver_id=${userId} OR id IN (SELECT ride_id FROM ride_bookings WHERE passenger_id=${userId}))`
      }, (payload) => {
        const message = payload.new;
        // Don't show notification for user's own messages
        if (message.sender_id !== userId) {
          this.handleNewMessage(message);
        }
      })
      .subscribe();

    // Listen for ride booking updates
    const bookingsChannel = supabase
      .channel('user-bookings')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'ride_bookings',
        filter: `passenger_id=eq.${userId}`
      }, (payload) => {
        this.handleBookingUpdate(payload.new, payload.old);
      })
      .subscribe();

    // Listen for driver ride requests
    const driverChannel = supabase
      .channel('driver-requests')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ride_bookings',
        filter: `ride_id=in.(SELECT id FROM rides WHERE driver_id=${userId})`
      }, (payload) => {
        this.handleNewRideRequest(payload.new);
      })
      .subscribe();

    // Listen for earnings updates
    const earningsChannel = supabase
      .channel('user-earnings')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'earnings',
        filter: `driver_id=eq.${userId}`
      }, (payload) => {
        this.handleNewEarning(payload.new);
      })
      .subscribe();

    // Listen for support ticket status changes
    const supportTicketsChannel = supabase
      .channel('support-ticket-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_ticket_notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        this.handleSupportTicketStatusChange(payload.new);
      })
      .subscribe();

    // Process any pending support ticket notifications on startup
    this.processPendingSupportTicketNotifications(userId);

    // Setup periodic license expiration checks (every hour when app is active)
    this.setupLicenseExpirationChecks(userId);

    return {
      messagesChannel,
      bookingsChannel,
      driverChannel,
      earningsChannel,
      supportTicketsChannel
    };
  }

  private async handleNewMessage(message: any) {
    try {
      const { data: sender } = await supabase
        .from('users')
        .select('display_name')
        .eq('id', message.sender_id)
        .single();

      const senderName = sender?.display_name || 'Someone';
      await this.showMessageNotification(senderName, message.content, message.ride_id);
    } catch (error) {
      console.error('Error handling new message notification:', error);
    }
  }

  private async handleBookingUpdate(newBooking: any, oldBooking: any) {
    if (newBooking.status !== oldBooking.status) {
      try {
        const { data: ride } = await supabase
          .from('rides')
          .select('from_location, to_location')
          .eq('id', newBooking.ride_id)
          .single();

        if (ride) {
          await this.showRideStatusNotification(newBooking.status, {
            id: newBooking.ride_id,
            from_location: ride.from_location,
            to_location: ride.to_location
          });
        }
      } catch (error) {
        console.error('Error handling booking update notification:', error);
      }
    }
  }

  private async handleNewRideRequest(booking: any) {
    try {
      const [{ data: ride }, { data: passenger }] = await Promise.all([
        supabase.from('rides').select('from_location, to_location').eq('id', booking.ride_id).single(),
        supabase.from('users').select('display_name').eq('id', booking.passenger_id).single()
      ]);

      if (ride && passenger) {
        await this.showRideRequestNotification({
          id: booking.ride_id,
          from_location: ride.from_location,
          to_location: ride.to_location
        }, passenger.display_name || 'Someone');
      }
    } catch (error) {
      console.error('Error handling new ride request notification:', error);
    }
  }

  private async handleNewEarning(earning: any) {
    try {
      const { data: ride } = await supabase
        .from('rides')
        .select('from_location, to_location')
        .eq('id', earning.ride_id)
        .single();

      if (ride) {
        const rideSummary = `${ride.from_location} to ${ride.to_location}`;
        await this.showEarningsNotification(earning.amount, rideSummary);
      }
    } catch (error) {
      console.error('Error handling new earning notification:', error);
    }
  }

  private async handleSupportTicketStatusChange(notification: any) {
    try {
      // Get the ticket details
      const { data: ticket, error } = await supabase
        .from('support_tickets')
        .select('title')
        .eq('id', notification.ticket_id)
        .single();

      if (error) {
        console.error('Error fetching ticket details:', error);
        return;
      }

      if (ticket) {
        await this.showSupportTicketStatusNotification(
          notification.ticket_id,
          ticket.title,
          notification.old_status,
          notification.new_status
        );

        // Mark this notification as sent
        await supabase.rpc('mark_support_ticket_notifications_sent', {
          notification_ids: [notification.id]
        });
      }
    } catch (error) {
      console.error('Error handling support ticket status change notification:', error);
    }
  }

  // Check if notifications are supported and enabled
  isSupported(): boolean {
    return 'Notification' in window && 'serviceWorker' in navigator;
  }

  isEnabled(): boolean {
    return this.permission === 'granted';
  }

  getPermissionStatus(): NotificationPermission {
    return this.permission;
  }

  // Setup periodic license expiration checks
  private setupLicenseExpirationChecks(userId: string) {
    // Check immediately
    this.checkLicenseExpiration(userId);

    // Check every hour while the app is active
    const checkInterval = setInterval(() => {
      this.checkLicenseExpiration(userId);
    }, 60 * 60 * 1000); // 1 hour

    // Clear interval when user closes the tab (cleanup)
    window.addEventListener('beforeunload', () => {
      clearInterval(checkInterval);
    });

    // Also check when user becomes active (tab focus)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkLicenseExpiration(userId);
      }
    });
  }
}

export default NotificationService;