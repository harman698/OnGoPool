import { supabase } from './supabase';

export interface RideAutomationResult {
  rides_completed: number;
  rides_deleted: number;  // Always 0 - data preservation policy
  timestamp: string;
}

class RideAutomationService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  // Run ride automation (completion and cleanup)
  async runAutomation(): Promise<RideAutomationResult | null> {
    try {
      const { data, error } = await supabase.rpc('run_ride_automation');
      
      if (error) {
        console.error('Error running ride automation:', error);
        return null;
      }

      const result: RideAutomationResult = data;
      
      if (result.rides_completed > 0 || result.rides_deleted > 0) {
        console.log('Ride automation results:', result);
      }

      return result;
    } catch (error) {
      console.error('Error in ride automation service:', error);
      return null;
    }
  }

  // Start periodic automation (runs every 5 minutes)
  startAutomation(): void {
    if (this.isRunning) {
      console.log('Ride automation is already running');
      return;
    }

    console.log('Starting ride automation service...');
    this.isRunning = true;

    // Run immediately
    this.runAutomation();

    // Set up periodic execution every 5 minutes (300,000 ms)
    this.intervalId = setInterval(() => {
      this.runAutomation();
    }, 5 * 60 * 1000);
  }

  // Stop periodic automation
  stopAutomation(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Ride automation service stopped');
  }

  // Check if automation is running
  isAutomationRunning(): boolean {
    return this.isRunning;
  }

  // Manually complete specific rides (for testing or manual triggers)
  async completeRidesManually(): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('auto_complete_rides');
      
      if (error) {
        console.error('Error completing rides manually:', error);
        return 0;
      }

      return data || 0;
    } catch (error) {
      console.error('Error in manual ride completion:', error);
      return 0;
    }
  }

  // REMOVED: Manually cleanup completed rides 
  // This function was removed to implement safe data deletion policy
  // Data is now preserved in database and only filtered in app interface
  async cleanupRidesManually(): Promise<number> {
    console.log('Ride cleanup disabled - data preservation policy in effect');
    console.log('All ride data is preserved in database for audit trail');
    return 0; // No rides deleted, all data preserved
  }

  // Update arrival times for existing rides
  async updateMissingArrivalTimes(): Promise<number> {
    try {
      const { data, error } = await supabase.rpc('update_missing_arrival_times');
      
      if (error) {
        console.error('Error updating arrival times:', error);
        return 0;
      }

      return data || 0;
    } catch (error) {
      console.error('Error updating arrival times:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const rideAutomationService = new RideAutomationService();