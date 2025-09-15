import { supabase } from './supabase';

export interface PaymentNotification {
  id?: string;
  user_id: string;
  booking_id: number;
  notification_type: 'payment_authorized' | 'payment_captured' | 'payment_refunded' | 'payment_failed' | 'payment_expired';
  title: string;
  message: string;
  status: 'pending' | 'sent' | 'failed';
  sent_at?: string;
  created_at: string;
}

export interface NotificationPreferences {
  email_notifications: boolean;
  push_notifications: boolean;
  sms_notifications: boolean;
  in_app_notifications: boolean;
}

/**
 * Payment Notification Service
 * Handles all payment-related notifications to users
 */
export class PaymentNotificationService {

  /**
   * Notification templates for different payment events
   */
  private static readonly NOTIFICATION_TEMPLATES = {
    payment_authorized: {
      title: "Payment Authorized",
      message: "Your payment has been authorized. You'll only be charged if the driver accepts your ride request.",
      icon: "💳",
      priority: "normal"
    },
    payment_captured: {
      title: "Payment Confirmed",
      message: "Your ride has been confirmed! Payment has been processed successfully.",
      icon: "✅",
      priority: "high"
    },
    payment_refunded: {
      driver_rejected: {
        title: "Ride Request Declined",
        message: "The driver declined your request. Your payment has been refunded automatically.",
        icon: "❌",
        priority: "high"
      },
      timeout: {
        title: "Request Timed Out",
        message: "The driver didn't respond within 12 hours. Your payment has been refunded automatically.",
        icon: "⏰",
        priority: "high"
      },
      passenger_cancelled: {
        title: "Ride Cancelled",
        message: "You cancelled your ride request. Your payment has been refunded automatically.",
        icon: "🚫",
        priority: "normal"
      }
    },
    payment_failed: {
      title: "Payment Failed",
      message: "Your payment could not be processed. Please try again with a different payment method.",
      icon: "⚠️",
      priority: "high"
    },
    payment_expired: {
      title: "Payment Authorization Expired",
      message: "Your payment authorization has expired. Please submit a new ride request.",
      icon: "⌛",
      priority: "normal"
    }
  };

  /**
   * Send payment authorization notification
   */
  static async notifyPaymentAuthorized(bookingId: number, userId: string): Promise<void> {
    const template = this.NOTIFICATION_TEMPLATES.payment_authorized;
    
    await this.createNotification({
      user_id: userId,
      booking_id: bookingId,
      notification_type: 'payment_authorized',
      title: template.title,
      message: template.message,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    // Send browser notification if enabled
    await this.sendBrowserNotification(userId, template.title, template.message, template.icon);
  }

  /**
   * Send payment captured notification
   */
  static async notifyPaymentCaptured(bookingId: number, userId: string): Promise<void> {
    const template = this.NOTIFICATION_TEMPLATES.payment_captured;
    
    await this.createNotification({
      user_id: userId,
      booking_id: bookingId,
      notification_type: 'payment_captured',
      title: template.title,
      message: template.message,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    // Send browser notification
    await this.sendBrowserNotification(userId, template.title, template.message, template.icon);
  }

  /**
   * Send payment refunded notification
   */
  static async notifyPaymentRefunded(
    bookingId: number, 
    userId: string, 
    reason: 'driver_rejected' | 'timeout' | 'passenger_cancelled'
  ): Promise<void> {
    const template = this.NOTIFICATION_TEMPLATES.payment_refunded[reason];
    
    await this.createNotification({
      user_id: userId,
      booking_id: bookingId,
      notification_type: 'payment_refunded',
      title: template.title,
      message: template.message,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    // Send browser notification
    await this.sendBrowserNotification(userId, template.title, template.message, template.icon);
  }

  /**
   * Send payment failed notification
   */
  static async notifyPaymentFailed(bookingId: number, userId: string, errorMessage?: string): Promise<void> {
    const template = this.NOTIFICATION_TEMPLATES.payment_failed;
    const message = errorMessage || template.message;
    
    await this.createNotification({
      user_id: userId,
      booking_id: bookingId,
      notification_type: 'payment_failed',
      title: template.title,
      message: message,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    // Send browser notification
    await this.sendBrowserNotification(userId, template.title, message, template.icon);
  }

  /**
   * Send payment expired notification
   */
  static async notifyPaymentExpired(bookingId: number, userId: string): Promise<void> {
    const template = this.NOTIFICATION_TEMPLATES.payment_expired;
    
    await this.createNotification({
      user_id: userId,
      booking_id: bookingId,
      notification_type: 'payment_expired',
      title: template.title,
      message: template.message,
      status: 'pending',
      created_at: new Date().toISOString()
    });

    // Send browser notification
    await this.sendBrowserNotification(userId, template.title, template.message, template.icon);
  }

  /**
   * Create notification record in database
   */
  private static async createNotification(notification: PaymentNotification): Promise<void> {
    try {
      const { error } = await supabase
        .from('payment_notifications')
        .insert(notification);

      if (error) {
        console.error('Failed to create payment notification:', error);
      }
    } catch (error) {
      console.error('Error creating payment notification:', error);
    }
  }

  /**
   * Send browser push notification
   */
  private static async sendBrowserNotification(
    userId: string, 
    title: string, 
    message: string, 
    icon: string
  ): Promise<void> {
    try {
      // Check if user has notification preferences
      const preferences = await this.getUserNotificationPreferences(userId);
      
      if (!preferences.push_notifications) {
        return; // User has disabled push notifications
      }

      // Check if browser supports notifications
      if ('Notification' in window) {
        // Request permission if not already granted
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }

        // Send notification if permission granted
        if (Notification.permission === 'granted') {
          const notification = new Notification(title, {
            body: message,
            icon: '/favicon.ico', // Use app icon
            badge: '/favicon.ico',
            tag: `payment-${userId}`, // Prevent duplicate notifications
            requireInteraction: true, // Keep notification visible until user interacts
            actions: [
              {
                action: 'view',
                title: 'View Details'
              }
            ]
          });

          // Handle notification click
          notification.onclick = () => {
            window.focus();
            notification.close();
            // Navigate to relevant page (bookings, trip details, etc.)
            window.location.hash = '#/trips';
          };

          // Auto-close after 10 seconds
          setTimeout(() => {
            notification.close();
          }, 10000);
        }
      }
    } catch (error) {
      console.error('Failed to send browser notification:', error);
    }
  }

  /**
   * Get user notification preferences
   */
  private static async getUserNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      const { data: user } = await supabase
        .from('users')
        .select('privacy_settings')
        .eq('id', userId)
        .single();

      // Default preferences if not set
      const defaultPreferences: NotificationPreferences = {
        email_notifications: true,
        push_notifications: true,
        sms_notifications: false,
        in_app_notifications: true
      };

      if (!user?.privacy_settings) {
        return defaultPreferences;
      }

      return {
        email_notifications: user.privacy_settings.emailNotifications ?? defaultPreferences.email_notifications,
        push_notifications: user.privacy_settings.pushNotifications ?? defaultPreferences.push_notifications,
        sms_notifications: user.privacy_settings.smsNotifications ?? defaultPreferences.sms_notifications,
        in_app_notifications: user.privacy_settings.inAppNotifications ?? defaultPreferences.in_app_notifications
      };

    } catch (error) {
      console.error('Failed to get user notification preferences:', error);
      return {
        email_notifications: true,
        push_notifications: true,
        sms_notifications: false,
        in_app_notifications: true
      };
    }
  }

  /**
   * Mark notification as sent
   */
  static async markNotificationSent(notificationId: string): Promise<void> {
    try {
      await supabase
        .from('payment_notifications')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', notificationId);
    } catch (error) {
      console.error('Failed to mark notification as sent:', error);
    }
  }

  /**
   * Get payment notifications for a user
   */
  static async getUserPaymentNotifications(
    userId: string, 
    limit: number = 10
  ): Promise<PaymentNotification[]> {
    try {
      const { data, error } = await supabase
        .from('payment_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Failed to get user payment notifications:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error getting user payment notifications:', error);
      return [];
    }
  }

  /**
   * Send batch notifications for multiple payment events
   */
  static async sendBatchNotifications(notifications: PaymentNotification[]): Promise<void> {
    try {
      const { error } = await supabase
        .from('payment_notifications')
        .insert(notifications);

      if (error) {
        console.error('Failed to send batch notifications:', error);
        return;
      }

      // Send browser notifications for each
      for (const notification of notifications) {
        const template = this.getTemplateForType(notification.notification_type);
        if (template) {
          await this.sendBrowserNotification(
            notification.user_id,
            notification.title,
            notification.message,
            template.icon
          );
        }
      }
    } catch (error) {
      console.error('Error sending batch notifications:', error);
    }
  }

  /**
   * Get template for notification type
   */
  private static getTemplateForType(type: PaymentNotification['notification_type']) {
    switch (type) {
      case 'payment_authorized':
        return this.NOTIFICATION_TEMPLATES.payment_authorized;
      case 'payment_captured':
        return this.NOTIFICATION_TEMPLATES.payment_captured;
      case 'payment_failed':
        return this.NOTIFICATION_TEMPLATES.payment_failed;
      case 'payment_expired':
        return this.NOTIFICATION_TEMPLATES.payment_expired;
      default:
        return null;
    }
  }

  /**
   * Clean up old notifications (called periodically)
   */
  static async cleanupOldNotifications(daysOld: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      
      const { error } = await supabase
        .from('payment_notifications')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (error) {
        console.error('Failed to cleanup old notifications:', error);
      } else {
        console.log(`Cleaned up payment notifications older than ${daysOld} days`);
      }
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
    }
  }
}

export default PaymentNotificationService;