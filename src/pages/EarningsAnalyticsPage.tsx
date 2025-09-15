import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  DollarSign, 
  Car,
  Users,
  BarChart3,
  PieChart,
  Download,
  Filter,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

interface EarningsData {
  date: string;
  amount: number; // Net amount after service fee
  grossAmount?: number; // Gross amount before service fee
  serviceFees?: number; // Service fee amount
  rides: number;
  passengers: number;
}

interface EarningsStats {
  totalEarnings: number; // Net earnings
  totalGrossEarnings?: number; // Gross earnings
  totalServiceFees?: number; // Total service fees
  totalRides: number;
  totalPassengers: number;
  averagePerRide: number;
  averagePerDay: number;
  bestDay: { date: string; amount: number };
  growth: number;
}

type TimePeriod = 'week' | 'month' | 'quarter' | 'year';

const EarningsAnalyticsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');
  const [earningsData, setEarningsData] = useState<EarningsData[]>([]);
  const [stats, setStats] = useState<EarningsStats>({
    totalEarnings: 0,
    totalRides: 0,
    totalPassengers: 0,
    averagePerRide: 0,
    averagePerDay: 0,
    bestDay: { date: '', amount: 0 },
    growth: 0,
  });

  useEffect(() => {
    if (user) {
      fetchEarningsData();
    }
  }, [user, timePeriod]);

  const getDateRange = () => {
    const now = new Date();
    const endDate = new Date(now);
    let startDate = new Date(now);

    switch (timePeriod) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    return { startDate, endDate };
  };

  const fetchEarningsData = async () => {
    if (!user) return;

    const isRefresh = refreshing;
    if (!isRefresh) setLoading(true);

    try {
      const { startDate, endDate } = getDateRange();

      // Fetch earnings data directly from the earnings table
      const { data: earnings, error } = await supabase
        .from('earnings')
        .select(`
          *,
          ride:rides(id, from_location, to_location, departure_time, available_seats),
          booking:ride_bookings(id, seats_booked, status)
        `)
        .eq('driver_id', user.id)
        .gte('earning_date', startDate.toISOString().split('T')[0])
        .lte('earning_date', endDate.toISOString().split('T')[0])
        .order('earning_date', { ascending: true });

      if (error) throw error;

      // Process data for charts and stats
      const processedData = processEarningsData(earnings || []);
      const calculatedStats = calculateStats(processedData);

      setEarningsData(processedData);
      setStats(calculatedStats);
    } catch (error) {
      console.error('Error fetching earnings data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const processEarningsData = (earnings: any[]): EarningsData[] => {
    const dailyData = new Map<string, { amount: number; grossAmount: number; serviceFees: number; rides: number; passengers: number }>();

    earnings.forEach((earning) => {
      const date = earning.earning_date;
      const current = dailyData.get(date) || { amount: 0, grossAmount: 0, serviceFees: 0, rides: 0, passengers: 0 };
      
      // Use net amount (after service fee) for display
      const netAmount = parseFloat(earning.amount);
      const grossAmount = parseFloat(earning.gross_amount || earning.amount);
      const serviceFeeAmount = parseFloat(earning.service_fee_amount || 0);
      
      dailyData.set(date, {
        amount: current.amount + netAmount, // Net earnings
        grossAmount: current.grossAmount + grossAmount, // Gross earnings
        serviceFees: current.serviceFees + serviceFeeAmount, // Service fees
        rides: current.rides + 1,
        passengers: current.passengers + (earning.booking?.seats_booked || 1),
      });
    });

    return Array.from(dailyData.entries())
      .map(([date, data]) => ({
        date,
        amount: Math.round(data.amount * 100) / 100, // Net amount shown in chart
        grossAmount: Math.round(data.grossAmount * 100) / 100,
        serviceFees: Math.round(data.serviceFees * 100) / 100,
        rides: data.rides,
        passengers: data.passengers,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const calculateStats = (data: EarningsData[]): EarningsStats => {
    const totalEarnings = data.reduce((sum, day) => sum + day.amount, 0); // Net earnings
    const totalGrossEarnings = data.reduce((sum, day) => sum + (day.grossAmount || day.amount), 0); // Gross earnings
    const totalServiceFees = data.reduce((sum, day) => sum + (day.serviceFees || 0), 0); // Service fees
    const totalRides = data.reduce((sum, day) => sum + day.rides, 0);
    const totalPassengers = data.reduce((sum, day) => sum + day.passengers, 0);
    
    const averagePerRide = totalRides > 0 ? totalEarnings / totalRides : 0;
    const averagePerDay = data.length > 0 ? totalEarnings / data.length : 0;
    
    const bestDay = data.reduce(
      (best, day) => (day.amount > best.amount ? day : best),
      { date: '', amount: 0 }
    );

    // Calculate growth (comparing first half to second half of period)
    const midPoint = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, midPoint);
    const secondHalf = data.slice(midPoint);
    
    const firstHalfAvg = firstHalf.length > 0 
      ? firstHalf.reduce((sum, day) => sum + day.amount, 0) / firstHalf.length 
      : 0;
    const secondHalfAvg = secondHalf.length > 0 
      ? secondHalf.reduce((sum, day) => sum + day.amount, 0) / secondHalf.length 
      : 0;
    
    const growth = firstHalfAvg > 0 
      ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 
      : 0;

    return {
      totalEarnings: Math.round(totalEarnings * 100) / 100, // Net earnings
      totalGrossEarnings: Math.round(totalGrossEarnings * 100) / 100, // Gross earnings
      totalServiceFees: Math.round(totalServiceFees * 100) / 100, // Service fees
      totalRides,
      totalPassengers,
      averagePerRide: Math.round(averagePerRide * 100) / 100,
      averagePerDay: Math.round(averagePerDay * 100) / 100,
      bestDay,
      growth: Math.round(growth * 100) / 100,
    };
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEarningsData();
  };

  const exportData = () => {
    const csvContent = [
      ['Date', 'Earnings', 'Rides', 'Passengers'],
      ...earningsData.map(day => [
        day.date,
        day.amount.toString(),
        day.rides.toString(),
        day.passengers.toString()
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `earnings-${timePeriod}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const maxAmount = Math.max(...earningsData.map(d => d.amount), 1);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <RefreshCw className="animate-spin text-blue-600" size={24} />
          <span className="text-gray-600">Loading earnings data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 text-white">
        <div className="px-4 pt-8 pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={() => navigate('/profile')}
                className="p-2 hover:bg-white/20 rounded-full transition-colors mr-3"
              >
                <ArrowLeft size={24} />
              </button>
              <div>
                <h1 className="text-2xl font-bold">Earnings Analytics</h1>
                <p className="text-blue-100 text-sm">Track your driving performance</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={exportData}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <Download size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Time Period Filter */}
        <div className="bg-white rounded-2xl p-4 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Filter size={20} className="text-gray-600" />
              <span className="font-semibold text-gray-900">Time Period</span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(['week', 'month', 'quarter', 'year'] as TimePeriod[]).map((period) => (
              <button
                key={period}
                onClick={() => setTimePeriod(period)}
                className={`py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
                  timePeriod === period
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <DollarSign size={20} className="text-green-600" />
                <span className="text-sm font-medium text-gray-600">Total Earnings</span>
              </div>
              <div className={`flex items-center space-x-1 ${
                stats.growth >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {stats.growth >= 0 ? (
                  <TrendingUp size={16} />
                ) : (
                  <TrendingDown size={16} />
                )}
                <span className="text-xs font-medium">
                  {Math.abs(stats.growth)}%
                </span>
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(stats.totalEarnings)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Gross: {formatCurrency(stats.totalGrossEarnings || 0)} • Fees: -{formatCurrency(stats.totalServiceFees || 0)}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {formatCurrency(stats.averagePerDay)} avg/day
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center space-x-2 mb-2">
              <Car size={20} className="text-blue-600" />
              <span className="text-sm font-medium text-gray-600">Total Rides</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalRides}</div>
            <div className="text-sm text-gray-500 mt-1">
              {formatCurrency(stats.averagePerRide)} avg/ride
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center space-x-2 mb-2">
              <Users size={20} className="text-purple-600" />
              <span className="text-sm font-medium text-gray-600">Total Passengers</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalPassengers}</div>
            <div className="text-sm text-gray-500 mt-1">
              {stats.totalRides > 0 ? (stats.totalPassengers / stats.totalRides).toFixed(1) : '0'} avg/ride
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center space-x-2 mb-2">
              <BarChart3 size={20} className="text-orange-600" />
              <span className="text-sm font-medium text-gray-600">Best Day</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(stats.bestDay.amount)}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {stats.bestDay.date ? formatDate(stats.bestDay.date) : 'No data'}
            </div>
          </div>
        </div>

        {/* Earnings Chart */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <BarChart3 size={20} className="text-blue-600" />
              <span className="font-semibold text-gray-900">Daily Earnings</span>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                <span className="text-sm text-gray-600">Earnings</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
                <span className="text-sm text-gray-600">Rides</span>
              </div>
            </div>
          </div>

          {earningsData.length > 0 ? (
            <div className="space-y-4">
              {earningsData.map((day, index) => (
                <div key={day.date} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{formatDate(day.date)}</span>
                    <div className="flex items-center space-x-4">
                      <span className="font-medium text-gray-900">
                        {formatCurrency(day.amount)}
                      </span>
                      <span className="text-gray-500">
                        {day.rides} rides, {day.passengers} passengers
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-full h-2 transition-all duration-500"
                        style={{ width: `${(day.amount / maxAmount) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="bg-gray-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <BarChart3 size={32} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No earnings data</h3>
              <p className="text-gray-600">
                Complete some rides to see your earnings analytics here.
              </p>
            </div>
          )}
        </div>

        {/* Performance Insights */}
        {earningsData.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100">
            <div className="flex items-center space-x-2 mb-4">
              <PieChart size={20} className="text-green-600" />
              <span className="font-semibold text-gray-900">Performance Insights</span>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
                <div>
                  <div className="font-semibold text-blue-900">
                    {stats.growth >= 0 ? 'Growing' : 'Declining'} Trend
                  </div>
                  <div className="text-sm text-blue-700">
                    Your earnings are {stats.growth >= 0 ? 'increasing' : 'decreasing'} by {Math.abs(stats.growth)}%
                  </div>
                </div>
                <div className={`text-2xl ${stats.growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.growth >= 0 ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 rounded-xl">
                  <div className="text-sm text-green-700 mb-1">Peak Performance</div>
                  <div className="font-semibold text-green-900">
                    {formatCurrency(stats.bestDay.amount)}
                  </div>
                  <div className="text-xs text-green-600">
                    on {stats.bestDay.date ? formatDate(stats.bestDay.date) : 'N/A'}
                  </div>
                </div>

                <div className="p-4 bg-purple-50 rounded-xl">
                  <div className="text-sm text-purple-700 mb-1">Efficiency</div>
                  <div className="font-semibold text-purple-900">
                    {formatCurrency(stats.averagePerRide)}
                  </div>
                  <div className="text-xs text-purple-600">per ride average</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EarningsAnalyticsPage;