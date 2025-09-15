export interface User {
  id: string;
  email?: string;
  display_name?: string;
  photo_url?: string;
  phone?: string;
  is_driver?: boolean;
  driver_license?: string;
  license_document_url?: string;
  license_verification_status?: 'unverified' | 'pending' | 'verified' | 'rejected';
  license_uploaded_at?: string;
  license_verified_at?: string;
  license_expiration_date?: string;
  car_model?: string;
  car_plate?: string;
  rating?: number;
  total_rides?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Driver {
  id: string;
  license_number?: string;
  license_expiration_date?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_year?: number;
  vehicle_color?: string;
  vehicle_plate?: string;
  insurance_policy_number?: string;
  insurance_expiration_date?: string;
  verified_at?: string;
  total_rides_completed?: number;
  total_earnings?: number;
  average_rating?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Passenger {
  id: string;
  preferred_seat_location?: 'front' | 'back' | 'any';
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  medical_conditions?: string;
  travel_preferences?: string;
  total_rides_taken?: number;
  total_spent?: number;
  average_rating?: number;
  frequent_routes?: any[];
  created_at?: string;
  updated_at?: string;
}

export interface Ride {
  id: number;
  driver_id: string;
  from_location: string;
  to_location: string;
  from_lat?: number;
  from_lng?: number;
  to_lat?: number;
  to_lng?: number;
  departure_time: string;
  arrival_time?: string; // ADDED: Missing field used in TripPage logic
  estimated_duration?: number; // ADDED: Missing field used in ETA calculations
  available_seats: number;
  price_per_seat: number;
  description?: string;
  car_model?: string;
  car_color?: string;
  license_plate?: string;
  status?: 'active' | 'completed' | 'cancelled';
  created_at?: string;
  updated_at?: string;
  driver?: User;
  ride_bookings?: RideBooking[]; // ADDED: Missing relation used in components
  ride_segments?: RideSegment[]; // ADDED: Missing relation used in ETA calculations
}

export interface RideBooking {
  id: number;
  ride_id: number;
  passenger_id: string;
  seats_booked: number;
  total_amount: number;
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'rejected';
  payment_status?: 'pending' | 'paid' | 'refunded';
  payment_intent_id?: string;
  from_segment_id?: number;
  to_segment_id?: number;
  created_at?: string;
  updated_at?: string;
  ride?: Ride;
  passenger?: User;
}

export interface RideSegment {
  id: number;
  ride_id?: number;
  address: string;
  lat?: number; // FIXED: Now properly typed as optional number
  lng?: number; // FIXED: Now properly typed as optional number
  segment_order: number;
  is_pickup?: boolean;
  created_at?: string;
}

export interface SegmentSeat {
  id: number;
  booking_id?: number;
  segment_id?: number;
  seats_count: number;
  created_at?: string;
}

export interface Conversation {
  id: number;
  booking_id?: number;
  driver_id: string;
  passenger_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface Message {
  id: number;
  ride_id: number;
  booking_id?: number;
  conversation_id?: number;
  sender_id: string;
  message: string;
  is_read?: boolean;
  created_at?: string;
  sender?: User;
}

export interface Rating {
  id: number;
  ride_id: number;
  rater_id: string;
  rated_user_id: string;
  rating: number;
  comment?: string;
  created_at?: string;
}

export interface Payment {
  id: number;
  booking_id?: number;
  user_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  payment_method: string;
  payment_intent_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Earning {
  id: string;
  driver_id: string;
  ride_id?: number;
  booking_id?: number;
  amount: number; // Net amount after service fee deduction
  gross_amount: number; // Total payment from passenger before service fee
  service_fee_amount: number; // Platform service fee amount
  service_fee_percentage: number; // Service fee percentage (default 15%)
  earning_date: string;
  status: 'pending' | 'available' | 'requested' | 'processing' | 'paid';
  payout_id?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  ride?: Ride;
  booking?: RideBooking;
}

export interface PayoutRequest {
  id: string;
  driver_id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  payment_method?: string;
  payment_details?: any;
  requested_at?: string;
  processed_at?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}