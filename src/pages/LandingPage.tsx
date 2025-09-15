import React from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-blue-700 flex flex-col items-center justify-center px-4">
      <div className="text-center space-y-12">
        {/* App Title Only */}
        <div className="flex items-center justify-center">
          <h1 className="text-5xl font-bold text-white tracking-tight">OnGoPool</h1>
        </div>

        {/* Start Button */}
        <button
          onClick={() => navigate('/auth')}
          className="bg-white text-blue-600 px-12 py-5 rounded-2xl text-xl font-bold transition-all duration-300 shadow-2xl hover:shadow-white/25 transform hover:scale-105 hover:bg-blue-50"
        >
          Get Started
        </button>
      </div>
    </div>
  );
};

export default LandingPage;