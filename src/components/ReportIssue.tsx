import React, { useState } from 'react';
import { 
  AlertTriangle,
  Bug,
  MessageCircle,
  Shield,
  Star,
  Zap,
  X,
  Send,
  Upload,
  Paperclip
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

interface ReportIssueProps {
  isOpen: boolean;
  onClose: () => void;
}

interface IssueReport {
  type: 'bug' | 'feature' | 'safety' | 'support' | 'other';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  contactEmail: string;
}

const ReportIssue: React.FC<ReportIssueProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  const [report, setReport] = useState<IssueReport>({
    type: 'bug',
    title: '',
    description: '',
    priority: 'medium',
    contactEmail: user?.email || '',
  });

  const issueTypes = [
    { value: 'bug', label: 'Bug Report', icon: Bug, color: 'text-red-600', desc: 'Something isn\'t working correctly' },
    { value: 'feature', label: 'Feature Request', icon: Star, color: 'text-blue-600', desc: 'Suggest a new feature or improvement' },
    { value: 'safety', label: 'Safety Concern', icon: Shield, color: 'text-orange-600', desc: 'Report safety or security issues' },
    { value: 'support', label: 'Support Request', icon: MessageCircle, color: 'text-green-600', desc: 'Get help with using the app' },
    { value: 'other', label: 'Other', icon: Zap, color: 'text-purple-600', desc: 'Something else' },
  ];

  const priorityLevels = [
    { value: 'low', label: 'Low', color: 'text-green-600', desc: 'Minor issue, no rush' },
    { value: 'medium', label: 'Medium', color: 'text-yellow-600', desc: 'Moderate impact' },
    { value: 'high', label: 'High', color: 'text-orange-600', desc: 'Significant impact' },
    { value: 'critical', label: 'Critical', color: 'text-red-600', desc: 'Urgent, major impact' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!report.title.trim() || !report.description.trim()) {
      alert('Please fill in both title and description');
      return;
    }

    setSubmitting(true);

    try {
      // Save the issue report to the support_tickets table in Supabase
      const issueData = {
        user_id: user?.id,
        type: report.type,
        title: report.title,
        description: report.description,
        priority: report.priority,
        contact_email: report.contactEmail,
        status: 'open',
        user_agent: navigator.userAgent,
        url: window.location.href,
      };

      const { data, error } = await supabase
        .from('support_tickets')
        .insert([issueData])
        .select()
        .single();

      if (error) {
        console.error('Error submitting support ticket:', error);
        throw error;
      }

      console.log('Support ticket created successfully:', data);
      
      setSubmitted(true);
      
      // Reset form after a delay
      setTimeout(() => {
        setSubmitted(false);
        setReport({
          type: 'bug',
          title: '',
          description: '',
          priority: 'medium',
          contactEmail: user?.email || '',
        });
        onClose();
      }, 3000);

    } catch (error) {
      console.error('Error submitting issue report:', error);
      alert('Failed to submit report. Please try again or contact support directly.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof IssueReport, value: string) => {
    setReport(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Send className="text-green-600" size={24} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Report Submitted!</h3>
            <p className="text-gray-600 mb-4">
              Thank you for your feedback. We'll review your report and get back to you if needed.
            </p>
            <div className="animate-pulse text-blue-600 text-sm">
              Closing automatically...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="text-orange-600" size={24} />
              <h2 className="text-xl font-bold text-gray-900">Report an Issue</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Issue Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                What type of issue would you like to report?
              </label>
              <div className="grid grid-cols-1 gap-3">
                {issueTypes.map((type) => {
                  const IconComponent = type.icon;
                  return (
                    <label
                      key={type.value}
                      className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        report.type === type.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="type"
                        value={type.value}
                        checked={report.type === type.value}
                        onChange={(e) => handleInputChange('type', e.target.value)}
                        className="sr-only"
                      />
                      <IconComponent className={`${type.color} mr-3 flex-shrink-0`} size={20} />
                      <div>
                        <div className="font-medium text-gray-900">{type.label}</div>
                        <div className="text-sm text-gray-600">{type.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Priority Level
              </label>
              <div className="grid grid-cols-2 gap-2">
                {priorityLevels.map((priority) => (
                  <label
                    key={priority.value}
                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${
                      report.priority === priority.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="priority"
                      value={priority.value}
                      checked={report.priority === priority.value}
                      onChange={(e) => handleInputChange('priority', e.target.value)}
                      className="sr-only"
                    />
                    <div className="text-center w-full">
                      <div className={`font-medium ${priority.color}`}>{priority.label}</div>
                      <div className="text-xs text-gray-600">{priority.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Issue Title *
              </label>
              <input
                type="text"
                id="title"
                value={report.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Brief description of the issue"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Detailed Description *
              </label>
              <textarea
                id="description"
                value={report.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Please provide as much detail as possible. Include steps to reproduce the issue if it's a bug."
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <div className="text-xs text-gray-500 mt-1">
                Minimum 10 characters. Be as specific as possible to help us understand the issue.
              </div>
            </div>

            {/* Contact Email */}
            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700 mb-2">
                Contact Email
              </label>
              <input
                type="email"
                id="contactEmail"
                value={report.contactEmail}
                onChange={(e) => handleInputChange('contactEmail', e.target.value)}
                placeholder="your.email@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="text-xs text-gray-500 mt-1">
                We'll use this to follow up with you about your report.
              </div>
            </div>

            {/* Additional Info */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-sm text-gray-600">
                <div className="font-medium mb-2">Additional information that will be included:</div>
                <ul className="space-y-1 text-xs">
                  <li>• Current page: {window.location.pathname}</li>
                  <li>• Browser: {navigator.userAgent.split(' ')[0]}</li>
                  <li>• Timestamp: {new Date().toLocaleString()}</li>
                  <li>• User ID: {user?.id?.substring(0, 8)}...</li>
                </ul>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={submitting || !report.title.trim() || !report.description.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    <span>Submit Report</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Help Text */}
            <div className="text-center text-xs text-gray-500">
              For urgent issues, you can also contact us directly at{' '}
              <a href="mailto:support@ongopool.com" className="text-blue-600 hover:underline">
                support@ongopool.com
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ReportIssue;