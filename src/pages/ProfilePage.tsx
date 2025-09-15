import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  Mail, 
  Phone, 
  Camera, 
  Shield, 
  CheckCircle, 
  AlertCircle, 
  DollarSign, 
  CreditCard, 
  Wallet, 
  Settings, 
  LogOut,
  Edit,
  Star,
  Car,
  Upload,
  History,
  Loader,
  Apple,
  Smartphone,
  Trash2,
  Bell,
  Flag,
  Receipt
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { User as UserType, PayoutRequest } from '../types';
import { EarningsService, EarningsStats } from '../lib/earningsService';
import NotificationSettings from '../components/NotificationSettings';
import PrivacySettings from '../components/PrivacySettings';
import ReportIssue from '../components/ReportIssue';
import NotificationService from '../lib/notificationService';
import RatingDisplay from '../components/RatingDisplay';
import SupportTickets from '../components/SupportTickets';
import PayoutRequestModal from '../components/PayoutRequestModal';
import PaymentMethodModal from '../components/PaymentMethodModal';

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuthStore();
  const [userProfile, setUserProfile] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingLicense, setUploadingLicense] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const licenseFileInputRef = useRef<HTMLInputElement>(null);
  const [profileData, setProfileData] = useState({
    display_name: '',
    phone: '',
    car_model: '',
    car_plate: '',
    driver_license: '',
    license_expiration_date: '',
  });
  const [earnings, setEarnings] = useState<EarningsStats>({
    totalEarnings: 0,
    thisMonth: 0,
    thisWeek: 0,
    lastMonth: 0,
    pendingPayouts: 0,
    completedRides: 0,
  });
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showPrivacySettings, setShowPrivacySettings] = useState(false);
  const [showReportIssue, setShowReportIssue] = useState(false);
  const [showSupportTickets, setShowSupportTickets] = useState(false);
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [latestPayout, setLatestPayout] = useState<PayoutRequest | null>(null);
  
  const notificationService = NotificationService.getInstance();

  useEffect(() => {
    if (user) {
      fetchUserProfile();
      fetchUserEarnings();
      fetchPaymentMethods();
      fetchLatestPayout();
    }
  }, [user]);

  const fetchUserProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      setUserProfile(data);
      setProfileData({
        display_name: data.display_name || '',
        phone: data.phone || '',
        car_model: data.car_model || '',
        car_plate: data.car_plate || '',
        driver_license: data.driver_license || '',
        license_expiration_date: data.license_expiration_date || '',
      });
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserEarnings = async () => {
    if (!user) {
      console.log('No user found for earnings calculation');
      return;
    }

    console.log('Fetching earnings for user:', user.id, user.email);

    try {
      // Try to fetch earnings using the new service
      const earningsStats = await EarningsService.fetchDriverEarnings(user.id);
      
      console.log('Earnings fetched from earnings table:', earningsStats);
      
      setEarnings(earningsStats);

    } catch (error) {
      console.error('Error fetching earnings:', error);
      // Fallback to old method if earnings table doesn't exist yet
      console.log('Falling back to old earnings calculation method...');
      
      try {
        // Fallback to calculating from rides/bookings directly
        const { data: rides, error: ridesError } = await supabase
          .from('rides')
          .select(`
            id, price_per_seat, departure_time, status,
            ride_bookings(seats_booked, status, total_amount, payment_status)
          `)
          .eq('driver_id', user.id);

        if (ridesError) throw ridesError;

        let totalEarnings = 0;
        let thisMonthEarnings = 0;
        let completedRides = 0;
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();

        rides?.forEach((ride) => {
          const rideDate = new Date(ride.departure_time);
          const eligibleBookings = ride.ride_bookings?.filter(booking => {
            const validStatuses = ['confirmed', 'completed'];
            const validPaymentStatuses = ['paid'];
            return validStatuses.includes(booking.status) || 
                   validPaymentStatuses.includes(booking.payment_status);
          }) || [];
          
          if (eligibleBookings.length > 0) {
            completedRides++;
            const rideEarnings = eligibleBookings.reduce((sum, booking) => {
              let bookingAmount = 0;
              if (typeof booking.total_amount === 'number') {
                bookingAmount = booking.total_amount;
              } else if (typeof booking.total_amount === 'string') {
                bookingAmount = parseFloat(booking.total_amount) || 0;
              }
              if (bookingAmount === 0 && ride.price_per_seat && booking.seats_booked) {
                bookingAmount = ride.price_per_seat * booking.seats_booked;
              }
              return sum + bookingAmount;
            }, 0);
            
            totalEarnings += rideEarnings;
            if (rideDate.getMonth() === currentMonth && rideDate.getFullYear() === currentYear) {
              thisMonthEarnings += rideEarnings;
            }
          }
        });

        setEarnings({
          totalEarnings: Number(totalEarnings.toFixed(2)),
          thisMonth: Number(thisMonthEarnings.toFixed(2)),
          thisWeek: 0,
          lastMonth: 0,
          pendingPayouts: Number(totalEarnings.toFixed(2)),
          completedRides,
        });
      } catch (fallbackError) {
        console.error('Fallback earnings calculation also failed:', fallbackError);
        setEarnings({
          totalEarnings: 0,
          thisMonth: 0,
          thisWeek: 0,
          lastMonth: 0,
          pendingPayouts: 0,
          completedRides: 0,
        });
      }
    }
  };

  const handlePayoutRequest = async () => {
    setShowPayoutModal(true);
  };

  const fetchLatestPayout = async () => {
    if (!user) return;

    try {
      const payoutRequests = await EarningsService.fetchPayoutRequests(user.id);
      if (payoutRequests && payoutRequests.length > 0) {
        // Get the most recent payout request
        setLatestPayout(payoutRequests[0]);
      }
    } catch (error) {
      console.error('Error fetching latest payout:', error);
    }
  };

  const handlePayoutSuccess = () => {
    // Refresh earnings to show updated pending payouts
    fetchUserEarnings();
    fetchLatestPayout();
  };

  const fetchPaymentMethods = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    }
  };

  const handleAddPaymentMethod = () => {
    setEditingPaymentMethod(null);
    setShowPaymentMethodModal(true);
  };

  const handleEditPaymentMethod = (method: any) => {
    setEditingPaymentMethod(method);
    setShowPaymentMethodModal(true);
  };

  const handleDeletePaymentMethod = async (methodId: string) => {
    if (!confirm('Are you sure you want to delete this payment method?')) return;

    try {
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_active: false })
        .eq('id', methodId);

      if (error) throw error;
      await fetchPaymentMethods();
    } catch (error) {
      console.error('Error deleting payment method:', error);
      alert('Failed to delete payment method');
    }
  };

  const handlePaymentMethodSuccess = () => {
    fetchPaymentMethods();
  };

  const getPaymentMethodIcon = (type: string) => {
    switch (type) {
      case 'credit_card':
      case 'debit_card':
        return CreditCard;
      case 'paypal':
        return Wallet;
      case 'apple_pay':
        return Apple;
      case 'google_pay':
        return Smartphone;
      default:
        return CreditCard;
    }
  };

  const formatPaymentMethodDisplay = (method: any) => {
    switch (method.type) {
      case 'credit_card':
      case 'debit_card':
        return {
          label: `•••• •••• •••• ${method.last_four}`,
          subtitle: `Expires ${method.expiry_month}/${method.expiry_year}`
        };
      case 'paypal':
        return {
          label: method.email,
          subtitle: 'PayPal Account'
        };
      case 'apple_pay':
        return {
          label: 'Apple Pay',
          subtitle: 'Touch ID / Face ID'
        };
      case 'google_pay':
        return {
          label: 'Google Pay',
          subtitle: 'Quick checkout'
        };
      default:
        return {
          label: 'Payment Method',
          subtitle: ''
        };
    }
  };

  const handleProfileUpdate = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('users')
        .update(profileData)
        .eq('id', user.id);

      if (error) throw error;

      setUserProfile({ ...userProfile, ...profileData } as UserType);
      setEditingProfile(false);
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile');
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setUploadingPhoto(true);

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/profile-${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(fileName);

      if (!urlData.publicUrl) {
        throw new Error('Failed to get public URL');
      }

      // Update user profile with photo URL
      const { error: updateError } = await supabase
        .from('users')
        .update({ photo_url: urlData.publicUrl })
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      // Update local state
      setUserProfile(prev => prev ? { ...prev, photo_url: urlData.publicUrl } : null);
      
      alert('Profile picture updated successfully!');
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('Failed to upload profile picture. Please try again.');
    } finally {
      setUploadingPhoto(false);
      // Clear the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleLicenseUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type (images and PDFs only)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please select an image (JPEG, PNG, WebP) or PDF file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    setUploadingLicense(true);

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/license-${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('driver-licenses')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        throw uploadError;
      }

      // For private buckets, we store the file path instead of a public URL
      // The actual signed URL will be generated when needed for viewing
      const filePath = fileName;

      // Update user profile with license file path and set status to pending
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          license_document_url: filePath, // Store file path instead of full URL
          license_verification_status: 'pending',
          license_uploaded_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      // Update local state
      setUserProfile(prev => prev ? { 
        ...prev, 
        license_document_url: filePath,
        license_verification_status: 'pending',
        license_uploaded_at: new Date().toISOString()
      } : null);
      
      alert('License document uploaded successfully! It will be reviewed for verification.');
    } catch (error) {
      console.error('Error uploading license:', error);
      alert('Failed to upload license document. Please try again.');
    } finally {
      setUploadingLicense(false);
      // Clear the input
      if (licenseFileInputRef.current) {
        licenseFileInputRef.current.value = '';
      }
    }
  };

  const handleLicenseUploadClick = () => {
    licenseFileInputRef.current?.click();
  };

  const handleViewLicenseDocument = async () => {
    if (!userProfile?.license_document_url) return;
    
    try {
      let objectPath = '';
      
      // Check if it's already a file path or a full URL
      if (userProfile.license_document_url.startsWith('http')) {
        // Extract the file path from the full URL more safely
        const url = new URL(userProfile.license_document_url);
        
        // Handle different URL formats from Supabase storage
        if (url.pathname.includes('/storage/v1/object/public/driver-licenses/')) {
          // Public URL format (but driver-licenses should be private)
          objectPath = url.pathname.split('/storage/v1/object/public/driver-licenses/')[1];
        } else if (url.pathname.includes('/storage/v1/object/sign/driver-licenses/')) {
          // Signed URL format
          objectPath = url.pathname.split('/storage/v1/object/sign/driver-licenses/')[1];
        } else if (url.pathname.includes('/object/driver-licenses/')) {
          // Another possible format
          objectPath = url.pathname.split('/object/driver-licenses/')[1];
        } else {
          // Fallback: try to extract user_id/filename pattern from the end of the path
          const pathParts = url.pathname.split('/').filter(part => part.length > 0);
          if (pathParts.length >= 2) {
            objectPath = pathParts.slice(-2).join('/'); // user_id/filename
          } else {
            throw new Error('Unable to parse file path from URL');
          }
        }
      } else {
        // It's already a file path
        objectPath = userProfile.license_document_url;
      }
      
      console.log('Attempting to access file at path:', objectPath);
      
      // Create a signed URL for secure access (skip bucket validation for now)
      const { data, error } = await supabase.storage
        .from('driver-licenses')
        .createSignedUrl(objectPath, 3600); // Valid for 1 hour
      
      if (error) {
        console.error('Error creating signed URL:', error);
        console.error('Attempted path:', objectPath);
        
        // If signed URL fails, try to list files in the user's folder to debug
        if (user?.id) {
          const { data: files, error: listError } = await supabase.storage
            .from('driver-licenses')
            .list(user.id);
          
          if (listError) {
            console.error('Error listing user files:', listError);
            
            // If listing fails, let's try to get the file directly by trying different path formats
            const possiblePaths = [
              objectPath,
              `${user.id}/${objectPath.split('/').pop()}`, // Just filename with user ID
              objectPath.replace(/^.*\//, `${user.id}/`) // Replace path prefix with user ID
            ];
            
            console.log('Trying alternative paths:', possiblePaths);
            
            // Try each possible path
            for (const path of possiblePaths) {
              console.log('Trying path:', path);
              const { data: retryData, error: retryError } = await supabase.storage
                .from('driver-licenses')
                .createSignedUrl(path, 3600);
              
              if (!retryError && retryData?.signedUrl) {
                console.log('Success with path:', path);
                window.open(retryData.signedUrl, '_blank');
                return;
              }
            }
            
            throw new Error('Unable to locate your license document. Please try re-uploading your license.');
          } else {
            console.log('Files in user directory:', files);
            
            // Find the actual file name in the user's directory
            if (files && files.length > 0) {
              // Look for the most recently uploaded license file
              const licenseFile = files
                .filter(file => file.name.includes('license'))
                .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
              
              if (licenseFile) {
                const correctPath = `${user.id}/${licenseFile.name}`;
                console.log('Using correct path from file listing:', correctPath);
                
                const { data: correctData, error: correctError } = await supabase.storage
                  .from('driver-licenses')
                  .createSignedUrl(correctPath, 3600);
                
                if (!correctError && correctData?.signedUrl) {
                  window.open(correctData.signedUrl, '_blank');
                  return;
                }
              }
            }
            
            throw new Error('Unable to generate secure access link for your license document.');
          }
        } else {
          throw new Error('User session not found. Please log in again.');
        }
      }
      
      // Open in new tab
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Error viewing license document:', error);
      alert(`Unable to view document: ${error.message}. Please try re-uploading your license document.`);
    }
  };

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Helper function to display rating
  const displayRating = () => {
    if (!userProfile?.rating || Number(userProfile.rating) === 0) {
      return 'New User';
    }
    return Number(userProfile.rating).toFixed(1);
  };

  if (loading) {
    return (
      <div className="p-4 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pb-24">
      {/* Header Section */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 text-white">
        <div className="px-4 pt-12 pb-8">
          <div className="text-center">
            <div className="relative inline-block mb-4">
              <div className="w-24 h-24 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border-4 border-white/30 overflow-hidden">
                {userProfile?.photo_url ? (
                  <img 
                    src={userProfile.photo_url} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.parentElement!.innerHTML = `<span class="text-white text-3xl font-bold">${userProfile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}</span>`;
                    }}
                  />
                ) : (
                  <span className="text-white text-3xl font-bold">
                    {userProfile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                  </span>
                )}
              </div>
              <button 
                onClick={handleCameraClick}
                disabled={uploadingPhoto}
                className="absolute -bottom-1 -right-1 bg-blue-500 text-white p-2 rounded-full hover:bg-blue-600 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingPhoto ? (
                  <Loader size={16} className="animate-spin" />
                ) : (
                  <Camera size={16} />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-center space-x-2">
                <h1 className="text-2xl font-bold">
                  {userProfile?.display_name || 'User'}
                </h1>
                <div className="flex items-center space-x-1 bg-yellow-500/20 px-2 py-1 rounded-full">
                  <Star size={16} className="text-yellow-300 fill-current" />
                  <span className="text-sm font-medium text-yellow-100">
                    {displayRating()}
                  </span>
                </div>
              </div>
              <p className="text-blue-100">{user?.email}</p>
              <p className="text-blue-200 text-sm">{userProfile?.total_rides || 0} rides completed</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Profile Information Card */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Profile Information</h2>
            <button
              onClick={() => setEditingProfile(!editingProfile)}
              className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-2 rounded-lg transition-colors"
            >
              <Edit size={16} />
              <span className="text-sm font-medium">
                {editingProfile ? 'Cancel' : 'Edit'}
              </span>
            </button>
          </div>

          {editingProfile ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={profileData.display_name}
                  onChange={(e) => setProfileData({ ...profileData, display_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Car Model
                </label>
                <input
                  type="text"
                  value={profileData.car_model}
                  onChange={(e) => setProfileData({ ...profileData, car_model: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  License Plate
                </label>
                <input
                  type="text"
                  value={profileData.car_plate}
                  onChange={(e) => setProfileData({ ...profileData, car_plate: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleProfileUpdate}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-semibold transition-colors"
              >
                Save Changes
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <Mail size={20} className="text-gray-500" />
                  <div>
                    <div className="text-sm text-gray-600">Email</div>
                    <div className="font-medium text-gray-900">{user?.email}</div>
                  </div>
                </div>
              </div>
              
              {userProfile?.phone ? (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <Phone size={20} className="text-gray-500" />
                    <div>
                      <div className="text-sm text-gray-600">Phone</div>
                      <div className="font-medium text-gray-900">{userProfile.phone}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 border-2 border-dashed border-gray-200 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <Phone size={20} className="text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-600">Phone</div>
                      <div className="text-gray-400">Not provided</div>
                    </div>
                  </div>
                </div>
              )}
              
              {userProfile?.car_model ? (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <Car size={20} className="text-gray-500" />
                    <div>
                      <div className="text-sm text-gray-600">Vehicle</div>
                      <div className="font-medium text-gray-900">
                        {userProfile.car_model}
                        {userProfile.car_plate && (
                          <span className="text-gray-500"> • {userProfile.car_plate}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 border-2 border-dashed border-gray-200 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <Car size={20} className="text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-600">Vehicle</div>
                      <div className="text-gray-400">Not provided</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* License Verification Section */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">License Verification</h2>
            {userProfile?.license_verification_status === 'verified' ? (
              <CheckCircle className="text-green-500" size={20} />
            ) : userProfile?.license_verification_status === 'pending' ? (
              <AlertCircle className="text-yellow-500" size={20} />
            ) : userProfile?.license_verification_status === 'rejected' ? (
              <AlertCircle className="text-red-500" size={20} />
            ) : (
              <AlertCircle className="text-orange-500" size={20} />
            )}
          </div>

          {userProfile?.license_verification_status === 'verified' ? (
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Shield size={16} className="text-green-500" />
                <span className="text-green-800 font-medium">License Verified</span>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-700">
                  Your driver's license has been verified. You can offer rides to other users.
                </p>
                <div className="mt-2 space-y-1">
                  {userProfile.license_verified_at && (
                    <p className="text-xs text-green-600">
                      Verified on {new Date(userProfile.license_verified_at).toLocaleDateString()}
                    </p>
                  )}
                  {userProfile.license_expiration_date && (
                    <p className={`text-xs ${
                      new Date(userProfile.license_expiration_date) < new Date() 
                        ? 'text-red-600' 
                        : new Date(userProfile.license_expiration_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                        ? 'text-yellow-600'
                        : 'text-green-600'
                    }`}>
                      Expires on {new Date(userProfile.license_expiration_date).toLocaleDateString()}
                      {new Date(userProfile.license_expiration_date) < new Date() && ' (Expired)'}
                      {new Date(userProfile.license_expiration_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && 
                       new Date(userProfile.license_expiration_date) >= new Date() && ' (Expires Soon)'}
                    </p>
                  )}
                </div>
              </div>
              {userProfile.license_document_url && (
                <div className="mt-3">
                  <button 
                    onClick={handleViewLicenseDocument}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    View License Document
                  </button>
                </div>
              )}
            </div>
          ) : userProfile?.license_verification_status === 'pending' ? (
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <Loader size={16} className="text-yellow-500 animate-spin" />
                <span className="text-yellow-800 font-medium">License Under Review</span>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-700">
                  Your license document has been uploaded and is currently being reviewed. You'll be notified once verification is complete.
                </p>
                {userProfile.license_uploaded_at && (
                  <p className="text-xs text-yellow-600 mt-2">
                    Uploaded on {new Date(userProfile.license_uploaded_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex space-x-3">
                <button 
                  onClick={handleLicenseUploadClick}
                  disabled={uploadingLicense}
                  className="flex items-center space-x-2 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {uploadingLicense ? (
                    <Loader size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  <span>Replace Document</span>
                </button>
                {userProfile.license_document_url && (
                  <button 
                    onClick={handleViewLicenseDocument}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium px-4 py-2"
                  >
                    View Current Document
                  </button>
                )}
              </div>
            </div>
          ) : userProfile?.license_verification_status === 'rejected' ? (
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <AlertCircle size={16} className="text-red-500" />
                <span className="text-red-800 font-medium">License Rejected</span>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700 mb-3">
                  Your license document was rejected. Please upload a clear, valid driver's license image or PDF.
                </p>
                <button 
                  onClick={handleLicenseUploadClick}
                  disabled={uploadingLicense}
                  className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {uploadingLicense ? (
                    <Loader size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  <span>Upload New Document</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <AlertCircle size={16} className="text-orange-500" />
                <span className="text-orange-800 font-medium">License Not Verified</span>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-4">
                <p className="text-sm text-orange-700">
                  Upload your driver's license document to start offering rides. Accepted formats: JPEG, PNG, WebP, PDF (max 10MB).
                </p>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      License Number (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Enter license number"
                      value={profileData.driver_license}
                      onChange={(e) => setProfileData({ ...profileData, driver_license: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      License Expiration Date
                    </label>
                    <input
                      type="date"
                      value={profileData.license_expiration_date ? profileData.license_expiration_date.split('T')[0] : ''}
                      onChange={(e) => setProfileData({ ...profileData, license_expiration_date: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This helps ensure compliance and track renewal needs
                    </p>
                  </div>
                </div>

                <button 
                  onClick={handleLicenseUploadClick}
                  disabled={uploadingLicense}
                  className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingLicense ? (
                    <Loader size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  <span>Upload License Document</span>
                </button>
              </div>
            </div>
          )}

          <input
            ref={licenseFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleLicenseUpload}
            className="hidden"
          />
        </div>

        {/* Earnings & Payout Section */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Earnings & Payouts</h2>
            <div className="flex space-x-2">
              <button
                onClick={() => navigate('/payout-history')}
                className="flex items-center space-x-2 text-green-600 hover:text-green-700 bg-green-50 px-3 py-2 rounded-lg transition-colors"
              >
                <Receipt size={16} />
                <span className="text-sm font-medium">History</span>
              </button>
            </div>
          </div>
          
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Available for Payout</span>
              <span className="font-semibold text-green-600">${earnings.pendingPayouts}</span>
            </div>
            {latestPayout && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Latest Payout Status</span>
                <span className={`font-semibold ${
                  latestPayout.status === 'paid' ? 'text-green-600' :
                  latestPayout.status === 'pending' ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {latestPayout.status.charAt(0).toUpperCase() + latestPayout.status.slice(1)}: ${latestPayout.amount}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handlePayoutRequest}
              disabled={earnings.pendingPayouts <= 0}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white py-3 px-4 rounded-xl font-semibold transition-colors"
            >
              Request Payout
            </button>
            <button
              onClick={() => navigate('/payout-history')}
              className="bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-xl font-semibold transition-colors flex items-center justify-center space-x-2"
            >
              <Receipt size={16} />
              <span>History</span>
            </button>
          </div>
        </div>

        {/* Payment Section */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Payment Methods</h2>
            <button
              onClick={() => navigate('/payment-history')}
              className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-2 rounded-lg transition-colors"
            >
              <Receipt size={16} />
              <span className="text-sm font-medium">Payment History</span>
            </button>
          </div>
          
          <div className="space-y-4">
            {paymentMethods.length > 0 ? (
              paymentMethods.map((method) => {
                const IconComponent = getPaymentMethodIcon(method.type);
                const displayInfo = formatPaymentMethodDisplay(method);
                
                return (
                  <div key={method.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                    <div className="flex items-center space-x-3">
                      <IconComponent size={20} className="text-gray-600" />
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className="font-medium text-gray-900">{displayInfo.label}</p>
                          {method.is_default && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{displayInfo.subtitle}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button 
                        onClick={() => handleEditPaymentMethod(method)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        Edit
                      </button>
                      {paymentMethods.length > 1 && (
                        <button 
                          onClick={() => handleDeletePaymentMethod(method.id)}
                          className="text-red-600 hover:text-red-700 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6 text-gray-500">
                <CreditCard size={48} className="mx-auto mb-2 text-gray-400" />
                <p>No payment methods added yet</p>
              </div>
            )}

            <button 
              onClick={handleAddPaymentMethod}
              className="w-full border border-dashed border-gray-300 text-gray-600 py-3 px-4 rounded-xl font-medium hover:border-gray-400 transition-colors"
            >
              + Add Payment Method
            </button>
          </div>
        </div>

        {/* Settings Section */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Settings</h2>
          
          <div className="space-y-3">
            <button 
              onClick={() => setShowNotificationSettings(true)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Settings size={20} className="text-gray-600" />
                <span className="text-gray-900">Notification Settings</span>
              </div>
              <span className="text-gray-400">→</span>
            </button>
            
            <button 
              onClick={() => setShowPrivacySettings(true)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Shield size={20} className="text-gray-600" />
                <span className="text-gray-900">Privacy Settings</span>
              </div>
              <span className="text-gray-400">→</span>
            </button>
            
            <button 
              onClick={() => setShowReportIssue(true)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Flag size={20} className="text-gray-600" />
                <span className="text-gray-900">Report an Issue</span>
              </div>
              <span className="text-gray-400">→</span>
            </button>
          </div>
        </div>

        {/* Logout Button */}
        <div className="pt-4">
          <button
            onClick={handleSignOut}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-4 px-4 rounded-xl font-semibold transition-colors flex items-center justify-center space-x-2"
          >
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Modals */}
      <NotificationSettings 
        isOpen={showNotificationSettings} 
        onClose={() => setShowNotificationSettings(false)} 
      />
      
      <PrivacySettings 
        isOpen={showPrivacySettings} 
        onClose={() => setShowPrivacySettings(false)} 
      />
      
      <ReportIssue 
        isOpen={showReportIssue} 
        onClose={() => setShowReportIssue(false)} 
      />

      <PayoutRequestModal
        isOpen={showPayoutModal}
        onClose={() => setShowPayoutModal(false)}
        availableAmount={earnings.pendingPayouts}
        onSuccess={handlePayoutSuccess}
      />

      <PaymentMethodModal
        isOpen={showPaymentMethodModal}
        onClose={() => setShowPaymentMethodModal(false)}
        onSuccess={handlePaymentMethodSuccess}
        editingMethod={editingPaymentMethod}
      />
    </div>
  );
};

export default ProfilePage;