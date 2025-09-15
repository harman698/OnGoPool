import React, { useState } from 'react';
import { Check, FileText, ExternalLink, X } from 'lucide-react';

interface TermsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  context: 'auth' | 'booking' | 'posting';
  required?: boolean;
}

const TermsCheckbox: React.FC<TermsCheckboxProps> = ({ 
  checked, 
  onChange, 
  context, 
  required = true 
}) => {
  const [showTermsModal, setShowTermsModal] = useState(false);

  const getContextText = () => {
    switch (context) {
      case 'auth':
        return 'creating an account';
      case 'booking':
        return 'booking this ride';
      case 'posting':
        return 'posting this ride';
      default:
        return 'using this service';
    }
  };

  const TermsModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <FileText size={24} className="text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">Terms and Conditions</h2>
          </div>
          <button
            onClick={() => setShowTermsModal(false)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm leading-relaxed">
          <div className="text-center mb-6">
            <p className="text-gray-600 text-lg">Last Updated: September 2025</p>
          </div>

          <section>
            <h3 className="text-lg font-bold text-gray-900 mb-3">1. Eligibility</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>You must be at least 18 years old to register and use this App.</li>
              <li>Drivers must hold a valid driver's licence and maintain insurance as required by law.</li>
              <li>Riders must comply with all applicable laws and safety requirements.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-gray-900 mb-3">2. Services Provided</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>OnGoPool is a platform that connects drivers offering rides with riders seeking transportation.</li>
              <li>OnGoPool does not provide transportation services; drivers are independent providers.</li>
              <li>We facilitate payments, communications, and safety features between users.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-gray-900 mb-3">3. User Responsibilities</h3>
            <div className="space-y-3">
              <div>
                <h4 className="font-semibold text-gray-900">Drivers must:</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li>Ensure their vehicles are roadworthy, insured, and compliant with Canadian law</li>
                  <li>Maintain valid driver's license and vehicle registration</li>
                  <li>Conduct themselves professionally and safely</li>
                  <li>Not discriminate against riders based on protected characteristics</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Riders must:</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                  <li>Behave respectfully, pay applicable fees, and comply with ride arrangements</li>
                  <li>Provide accurate pickup and destination information</li>
                  <li>Be punctual for scheduled rides</li>
                  <li>Treat drivers and other passengers with respect</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-gray-900 mb-3">4. Payments and Fees</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Payments are processed through the App's secure payment system.</li>
              <li>Fees may include ride charges, service fees, and applicable taxes.</li>
              <li>Drivers receive payment after the ride is completed, minus service fees.</li>
              <li>All prices are displayed in Canadian dollars (CAD).</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-gray-900 mb-3">5. Cancellation and Refund Policy</h3>
            <div className="space-y-3">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-2">Cancellation more than 12 hours before departure</h4>
                <ul className="list-disc list-inside space-y-1 text-blue-800">
                  <li>Full refund of the ride fare</li>
                  <li>Service fees (if any) are non-refundable</li>
                </ul>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h4 className="font-semibold text-yellow-900 mb-2">Cancellation between 6 and 12 hours before departure</h4>
                <ul className="list-disc list-inside space-y-1 text-yellow-800">
                  <li>50% refund of the ride fare</li>
                  <li>Service fees (if any) are non-refundable</li>
                </ul>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <h4 className="font-semibold text-red-900 mb-2">Cancellation less than 6 hours before departure or no-show</h4>
                <p className="text-red-800">No refund will be issued</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-gray-900 mb-3">6. Safety and Security</h3>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>User verification processes including driver license checks</li>
              <li>In-app emergency contact features and real-time trip tracking</li>
              <li>User rating and review system for community safety</li>
              <li>Report safety concerns through in-app reporting tools</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-gray-900 mb-3">12. Governing Law and Consumer Rights</h3>
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold text-green-900 mb-2">🇨🇦 Canadian Consumer Protection Rights</h4>
              <p className="text-green-800 mb-2">
                <strong>IMPORTANT:</strong> Your rights as a consumer are protected under Canadian law. These Terms do not limit your rights under:
              </p>
              <ul className="list-disc list-inside space-y-1 text-green-700">
                <li><strong>Ontario Users:</strong> Consumer Protection Act, 2002 provides additional cancellation rights</li>
                <li><strong>Quebec Users:</strong> Consumer Protection Act provides enhanced protections</li>
                <li><strong>All Provinces:</strong> Competition Act (Canada) protections and provincial consumer protection legislation</li>
              </ul>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-gray-900 mb-3">14. Contact Information</h3>
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-900 mb-2">OnGoPool Support</h4>
              <ul className="space-y-1 text-gray-700">
                <li>Email: support@ongopool.ca</li>
                <li>Phone: 1-800-ONGOPOOL (1-800-664-6766)</li>
                <li>Website: www.ongopool.ca</li>
                <li>Emergency Safety: safety@ongopool.ca</li>
              </ul>
            </div>
          </section>
        </div>
        
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              By {getContextText()}, you agree to these terms and conditions.
            </p>
            <button
              onClick={() => {
                onChange(true);
                setShowTermsModal(false);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              Accept Terms
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="flex items-start space-x-3">
        <div className="relative flex-shrink-0 mt-1">
          <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`w-5 h-5 rounded border-2 transition-all duration-200 ${
              checked
                ? 'bg-blue-600 border-blue-600'
                : 'bg-white border-gray-300 hover:border-blue-600'
            }`}
          >
            {checked && (
              <Check size={12} className="text-white absolute top-0.5 left-0.5" />
            )}
          </button>
        </div>
        
        <div className="flex-1">
          <p className="text-sm text-gray-700 leading-relaxed">
            {required && <span className="text-red-500">* </span>}
            I agree to the{' '}
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className="text-blue-600 hover:text-blue-700 font-medium underline inline-flex items-center"
            >
              Terms and Conditions
              <ExternalLink size={12} className="ml-1" />
            </button>
            {' '}and{' '}
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className="text-blue-600 hover:text-blue-700 font-medium underline"
            >
              Cancellation Policy
            </button>
            {' '}for {getContextText()}.
          </p>
          
          {context === 'auth' && (
            <p className="text-xs text-gray-500 mt-1">
              This includes consent to data collection and processing as outlined in our Privacy Policy.
            </p>
          )}
          
          {context === 'booking' && (
            <p className="text-xs text-gray-500 mt-1">
              Payment will be processed according to our cancellation policy. Review terms before booking.
            </p>
          )}
          
          {context === 'posting' && (
            <p className="text-xs text-gray-500 mt-1">
              You confirm your vehicle is properly insured and you hold a valid driver's license.
            </p>
          )}
        </div>
      </div>
      
      {showTermsModal && <TermsModal />}
    </>
  );
};

export default TermsCheckbox;