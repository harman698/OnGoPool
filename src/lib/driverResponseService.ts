import { supabase } from './supabase';

export interface DriverWarningData {
  userId: string;
  cancellationCount: number;
  warningLevel: 'none' | 'warning' | 'suspension' | 'banned';
  suspensionUntil?: Date;
  lastCancellation: Date;
}

export interface DriverCancellationTracking {
  totalCancellations: number;
  cancellationsThisMonth: number;
  consecutiveCancellations: number;
  warningsSent: number;
  accountStatus: 'active' | 'warned' | 'suspended' | 'banned';
  suspensionUntil?: Date;
  lastWarningDate?: Date;
}

/**
 * Driver Response Service with Cancellation Tracking
 * Handles driver warnings and account suspensions for repeated cancellations
 */
export class DriverResponseService {

  /**
   * Track driver cancellation and apply warnings/suspensions
   */
  static async trackDriverCancellation(driverId: string, rideId: number): Promise<DriverWarningData> {
    try {
      // Get driver's cancellation history from the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentCancellations } = await supabase
        .from('rides')
        .select('id, created_at, updated_at')
        .eq('driver_id', driverId)
        .eq('status', 'cancelled')
        .gte('updated_at', thirtyDaysAgo.toISOString())
        .order('updated_at', { ascending: false });

      const cancellationCount = (recentCancellations?.length || 0) + 1; // +1 for current cancellation

      // Get driver profile to check current warning status
      const { data: driverProfile } = await supabase
        .from('users')
        .select('account_status, suspension_until, cancellation_warnings')
        .eq('id', driverId)
        .single();

      // Determine warning level based on cancellation frequency
      const warningData = this.calculateWarningLevel(
        cancellationCount, 
        driverProfile?.cancellation_warnings || 0
      );

      // Update driver profile with new warning status
      await this.updateDriverWarningStatus(driverId, warningData);

      // Send notification if warning or suspension is applied
      await this.sendDriverWarningNotification(driverId, warningData);

      // Log the cancellation tracking event
      await this.logCancellationEvent(driverId, rideId, warningData);

      return {
        userId: driverId,
        cancellationCount,
        warningLevel: warningData.warningLevel,
        suspensionUntil: warningData.suspensionUntil,
        lastCancellation: new Date()
      };

    } catch (error) {
      console.error('Error tracking driver cancellation:', error);
      throw error;
    }
  }

  /**
   * Calculate warning level based on cancellation history
   */
  private static calculateWarningLevel(
    cancellationCount: number, 
    previousWarnings: number
  ): {
    warningLevel: 'none' | 'warning' | 'suspension' | 'banned';
    suspensionUntil?: Date;
    newWarningCount: number;
  } {
    let warningLevel: 'none' | 'warning' | 'suspension' | 'banned' = 'none';
    let suspensionUntil: Date | undefined;
    let newWarningCount = previousWarnings;

    // Warning thresholds
    if (cancellationCount >= 8) {
      // 8+ cancellations in 30 days = permanent ban
      warningLevel = 'banned';
      newWarningCount = previousWarnings + 1;
    } else if (cancellationCount >= 6) {
      // 6-7 cancellations = 7-day suspension
      warningLevel = 'suspension';
      suspensionUntil = new Date();
      suspensionUntil.setDate(suspensionUntil.getDate() + 7);
      newWarningCount = previousWarnings + 1;
    } else if (cancellationCount >= 4) {
      // 4-5 cancellations = 3-day suspension
      warningLevel = 'suspension';
      suspensionUntil = new Date();
      suspensionUntil.setDate(suspensionUntil.getDate() + 3);
      newWarningCount = previousWarnings + 1;
    } else if (cancellationCount >= 3) {
      // 3 cancellations = warning
      warningLevel = 'warning';
      newWarningCount = previousWarnings + 1;
    }

    return { warningLevel, suspensionUntil, newWarningCount };
  }

  /**
   * Update driver's warning status in database
   */
  private static async updateDriverWarningStatus(
    driverId: string, 
    warningData: {
      warningLevel: 'none' | 'warning' | 'suspension' | 'banned';
      suspensionUntil?: Date;
      newWarningCount: number;
    }
  ): Promise<void> {
    try {
      const updateData: any = {
        cancellation_warnings: warningData.newWarningCount,
        last_warning_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Set account status based on warning level
      switch (warningData.warningLevel) {
        case 'banned':
          updateData.account_status = 'banned';
          updateData.suspension_until = null; // Permanent ban
          break;
        case 'suspension':
          updateData.account_status = 'suspended';
          updateData.suspension_until = warningData.suspensionUntil?.toISOString();
          break;
        case 'warning':
          updateData.account_status = 'warned';
          updateData.suspension_until = null;
          break;
        default:
          // No change needed for 'none'
          break;
      }

      await supabase
        .from('users')
        .update(updateData)
        .eq('id', driverId);

    } catch (error) {
      console.error('Error updating driver warning status:', error);
      throw error;
    }
  }

  /**
   * Send notification to driver about warning or suspension
   */
  private static async sendDriverWarningNotification(
    driverId: string,
    warningData: {
      warningLevel: 'none' | 'warning' | 'suspension' | 'banned';
      suspensionUntil?: Date;
    }
  ): Promise<void> {
    try {
      let title = '';
      let message = '';
      let notificationType = 'warning';

      switch (warningData.warningLevel) {
        case 'warning':
          title = 'Cancellation Warning';
          message = 'You have cancelled multiple rides recently. Please note that excessive cancellations may result in account suspension.';
          break;
        case 'suspension':
          title = 'Account Temporarily Suspended';
          message = `Your account has been suspended until ${warningData.suspensionUntil?.toLocaleDateString()} due to repeated ride cancellations. You cannot post new rides during this period.`;
          notificationType = 'suspension';
          break;
        case 'banned':
          title = 'Account Banned';
          message = 'Your account has been permanently banned due to excessive ride cancellations. Please contact support if you believe this was an error.';
          notificationType = 'ban';
          break;
        default:
          return; // No notification for 'none'
      }

      // Insert notification record
      await supabase
        .from('driver_warnings')
        .insert({
          driver_id: driverId,
          warning_type: notificationType,
          title,
          message,
          suspension_until: warningData.suspensionUntil?.toISOString(),
          created_at: new Date().toISOString()
        });

      // Also create a support ticket for serious cases
      if (warningData.warningLevel === 'suspension' || warningData.warningLevel === 'banned') {
        await supabase
          .from('support_tickets')
          .insert({
            user_id: driverId,
            subject: title,
            description: message,
            category: 'account_suspension',
            priority: 'high',
            status: 'auto_generated',
            created_at: new Date().toISOString()
          });
      }

    } catch (error) {
      console.error('Error sending driver warning notification:', error);
    }
  }

  /**
   * Log cancellation event for tracking purposes
   */
  private static async logCancellationEvent(
    driverId: string,
    rideId: number,
    warningData: {
      warningLevel: 'none' | 'warning' | 'suspension' | 'banned';
      suspensionUntil?: Date;
    }
  ): Promise<void> {
    try {
      await supabase
        .from('driver_cancellation_log')
        .insert({
          driver_id: driverId,
          ride_id: rideId,
          cancellation_date: new Date().toISOString(),
          warning_level: warningData.warningLevel,
          suspension_until: warningData.suspensionUntil?.toISOString(),
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error logging cancellation event:', error);
    }
  }

  /**
   * Check if driver can post new rides (basic profile verification)
   */
  static async canDriverPostRide(driverId: string): Promise<{
    canPost: boolean;
    reason?: string;
    suspensionUntil?: Date;
  }> {
    try {
      console.log('Checking driver eligibility for user ID:', driverId);
      
      const { data: driver, error } = await supabase
        .from('users')
        .select('id, email, display_name, license_verification_status, is_driver')
        .eq('id', driverId)
        .single();

      if (error) {
        console.error('Supabase error checking driver eligibility:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        
        // If it's a "not found" error, try to create the profile
        if (error.code === 'PGRST116' || error.message?.includes('No rows found')) {
          console.log('Driver profile not found, attempting to create...');
          
          // Get user data from auth to create profile
          const { data: { user } } = await supabase.auth.getUser();
          if (user && user.id === driverId) {
            console.log('Creating missing user profile for:', driverId);
            
            const { error: createError } = await supabase
              .from('users')
              .insert([
                {
                  id: user.id,
                  email: user.email,
                  display_name: user.user_metadata.display_name || user.email?.split('@')[0] || 'User',
                  photo_url: user.user_metadata.avatar_url,
                  license_verification_status: 'unverified',
                  is_driver: false,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
              ]);

            if (createError) {
              console.error('Failed to create user profile:', createError);
              console.error('Create error details:', JSON.stringify(createError, null, 2));
              
              // Check if it's a duplicate key error (profile already exists)
              if (createError.code === '23505' || createError.message?.includes('duplicate key')) {
                console.log('Profile already exists, continuing with eligibility check...');
                // Profile exists, continue with normal flow
              } else {
                return { canPost: false, reason: 'Unable to create driver profile. Please contact support.' };
              }
            } else {
              console.log('User profile created successfully');
            }
            
            console.log('Checking eligibility again after profile creation/verification...');
            // Wait a moment for database consistency
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Try fetching the profile again instead of recursive call to avoid infinite loops
            const { data: newDriver, error: newError } = await supabase
              .from('users')
              .select('id, email, display_name, license_verification_status, is_driver')
              .eq('id', driverId)
              .single();

            if (newError || !newDriver) {
              console.error('Still unable to fetch driver profile after creation:', newError);
              return { canPost: false, reason: 'Profile creation failed. Please try logging out and back in.' };
            }
            
            // Use the newly fetched profile data
            console.log('Successfully retrieved driver profile after creation:', { 
              id: driverId, 
              email: newDriver.email,
              license_status: newDriver.license_verification_status,
              is_driver: newDriver.is_driver
            });

            // Basic eligibility - user profile exists, can post rides
            return { canPost: true };
          } else {
            console.error('Unable to get current user for profile creation');
            return { canPost: false, reason: 'Unable to verify your identity. Please log out and back in.' };
          }
        }
        
        return { canPost: false, reason: 'Unable to verify driver profile. Please try again.' };
      }

      if (!driver) {
        console.error('Driver profile not found for ID:', driverId);
        return { canPost: false, reason: 'Driver profile not found. Please ensure you are logged in properly.' };
      }

      console.log('Driver profile found:', { 
        id: driverId, 
        email: driver.email,
        license_status: driver.license_verification_status,
        is_driver: driver.is_driver
      });

      // Basic eligibility check - if user profile exists, they can post rides
      // License verification will be checked separately in PostRidePage
      return { canPost: true };

    } catch (error) {
      console.error('Error checking driver posting eligibility:', error);
      return { 
        canPost: false, 
        reason: 'Error checking account status. Please try again.' 
      };
    }
  }

  /**
   * Get driver's cancellation statistics
   */
  static async getDriverCancellationStats(driverId: string): Promise<DriverCancellationTracking> {
    try {
      // Get driver profile data
      const { data: driver } = await supabase
        .from('users')
        .select('account_status, suspension_until, cancellation_warnings, last_warning_date')
        .eq('id', driverId)
        .single();

      // Get cancellation counts
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recentCancellations } = await supabase
        .from('rides')
        .select('id, updated_at')
        .eq('driver_id', driverId)
        .eq('status', 'cancelled')
        .gte('updated_at', thirtyDaysAgo.toISOString());

      const { data: totalCancellations } = await supabase
        .from('rides')
        .select('id')
        .eq('driver_id', driverId)
        .eq('status', 'cancelled');

      // Calculate consecutive cancellations (last 5 rides)
      const { data: recentRides } = await supabase
        .from('rides')
        .select('id, status')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(5);

      let consecutiveCancellations = 0;
      for (const ride of recentRides || []) {
        if (ride.status === 'cancelled') {
          consecutiveCancellations++;
        } else {
          break;
        }
      }

      return {
        totalCancellations: totalCancellations?.length || 0,
        cancellationsThisMonth: recentCancellations?.length || 0,
        consecutiveCancellations,
        warningsSent: driver?.cancellation_warnings || 0,
        accountStatus: driver?.account_status || 'active',
        suspensionUntil: driver?.suspension_until ? new Date(driver.suspension_until) : undefined,
        lastWarningDate: driver?.last_warning_date ? new Date(driver.last_warning_date) : undefined
      };

    } catch (error) {
      console.error('Error getting driver cancellation stats:', error);
      return {
        totalCancellations: 0,
        cancellationsThisMonth: 0,
        consecutiveCancellations: 0,
        warningsSent: 0,
        accountStatus: 'active'
      };
    }
  }

  /**
   * Clear driver warnings (admin function for dispute resolutions)
   */
  static async clearDriverWarnings(driverId: string): Promise<boolean> {
    try {
      await supabase
        .from('users')
        .update({
          account_status: 'active',
          suspension_until: null,
          cancellation_warnings: 0,
          last_warning_date: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', driverId);

      return true;
    } catch (error) {
      console.error('Error clearing driver warnings:', error);
      return false;
    }
  }
}