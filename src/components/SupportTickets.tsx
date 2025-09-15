import React, { useState, useEffect } from 'react';
import { 
  Ticket,
  Clock,
  CheckCircle,
  AlertCircle,
  MessageCircle,
  Calendar,
  User,
  RefreshCw,
  Plus,
  Bell
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import NotificationService from '../lib/notificationService';

interface SupportTicket {
  id: number;
  type: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  contact_email: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  resolution_notes?: string;
}

interface SupportTicketsProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNew: () => void;
}

const SupportTickets: React.FC<SupportTicketsProps> = ({ isOpen, onClose, onCreateNew }) => {
  const { user } = useAuthStore();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [realTimeUpdates, setRealTimeUpdates] = useState(0);
  const notificationService = NotificationService.getInstance();

  const statusColors = {
    open: 'text-blue-600 bg-blue-50 border-blue-200',
    in_progress: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    resolved: 'text-green-600 bg-green-50 border-green-200',
    closed: 'text-gray-600 bg-gray-50 border-gray-200',
  };

  const statusIcons = {
    open: AlertCircle,
    in_progress: Clock,
    resolved: CheckCircle,
    closed: CheckCircle,
  };

  const priorityColors = {
    low: 'text-green-600',
    medium: 'text-yellow-600',
    high: 'text-orange-600',
    critical: 'text-red-600',
  };

  const typeLabels = {
    bug: 'Bug Report',
    feature: 'Feature Request',
    safety: 'Safety Concern',
    support: 'Support Request',
    other: 'Other',
  };

  useEffect(() => {
    if (isOpen && user) {
      fetchTickets();
      setupRealTimeSubscription();
    }

    return () => {
      // Cleanup real-time subscription when component unmounts or modal closes
      if (!isOpen) {
        cleanupRealTimeSubscription();
      }
    };
  }, [isOpen, user]);

  // Refetch tickets when real-time updates occur
  useEffect(() => {
    if (realTimeUpdates > 0 && isOpen) {
      fetchTickets();
    }
  }, [realTimeUpdates, isOpen]);

  const setupRealTimeSubscription = () => {
    if (!user) return;

    // Subscribe to support ticket changes for this user
    const channel = supabase
      .channel('user-support-tickets')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_tickets',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        console.log('Support ticket updated:', payload);
        // Trigger a re-fetch of tickets
        setRealTimeUpdates(prev => prev + 1);
      })
      .subscribe();

    // Store reference for cleanup
    (window as any).supportTicketsChannel = channel;
  };

  const cleanupRealTimeSubscription = () => {
    if ((window as any).supportTicketsChannel) {
      supabase.removeChannel((window as any).supportTicketsChannel);
      (window as any).supportTicketsChannel = null;
    }
  };

  const fetchTickets = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching support tickets:', error);
        throw error;
      }

      setTickets(data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTickets();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Ticket className="text-blue-600" size={24} />
              <div>
                <h2 className="text-xl font-bold text-gray-900">My Support Tickets</h2>
                <p className="text-sm text-gray-600">Track your submitted issues and requests</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={onCreateNew}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
              >
                <Plus size={16} />
                <span>New Ticket</span>
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading your tickets...</span>
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12">
              <Ticket className="mx-auto text-gray-400 mb-4" size={48} />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Support Tickets</h3>
              <p className="text-gray-600 mb-6">
                You haven't submitted any support tickets yet. Need help with something?
              </p>
              <button
                onClick={onCreateNew}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Create Your First Ticket
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => {
                const StatusIcon = statusIcons[ticket.status as keyof typeof statusIcons] || AlertCircle;
                const statusClass = statusColors[ticket.status as keyof typeof statusColors] || statusColors.open;
                const priorityClass = priorityColors[ticket.priority as keyof typeof priorityColors] || priorityColors.medium;
                const typeLabel = typeLabels[ticket.type as keyof typeof typeLabels] || ticket.type;

                return (
                  <div key={ticket.id} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">#{ticket.id} {ticket.title}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusClass}`}>
                            <StatusIcon size={12} className="inline mr-1" />
                            {ticket.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                          <span className="flex items-center">
                            <User size={14} className="mr-1" />
                            {typeLabel}
                          </span>
                          <span className={`font-medium ${priorityClass}`}>
                            {ticket.priority.toUpperCase()} Priority
                          </span>
                          <span className="flex items-center">
                            <Calendar size={14} className="mr-1" />
                            {formatDate(ticket.created_at)}
                          </span>
                        </div>
                        <p className="text-gray-700 line-clamp-3">
                          {ticket.description}
                        </p>
                      </div>
                    </div>

                    {ticket.resolution_notes && (
                      <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center mb-2">
                          <MessageCircle size={16} className="text-green-600 mr-2" />
                          <span className="font-medium text-green-800">Resolution</span>
                          {ticket.resolved_at && (
                            <span className="ml-auto text-sm text-green-600">
                              {formatDate(ticket.resolved_at)}
                            </span>
                          )}
                        </div>
                        <p className="text-green-700 text-sm">
                          {ticket.resolution_notes}
                        </p>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                      <span>Last updated: {formatDate(ticket.updated_at)}</span>
                      {ticket.contact_email && (
                        <span>Contact: {ticket.contact_email}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportTickets;