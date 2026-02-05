import React from 'react';

interface NavBarProps {
  activeTab: 'profile' | 'find';
  onTabChange: (tab: 'profile' | 'find') => void;
}

export const NavBar: React.FC<NavBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="w-full border-b border-[#000000]/5 bg-white/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex gap-8">
          <button
            onClick={() => onTabChange('profile')}
            className={`py-4 text-sm font-medium border-b-2 transition-all duration-200 ${
              activeTab === 'profile'
                ? 'border-[#0071E3] text-[#1D1D1F]'
                : 'border-transparent text-[#86868B] hover:text-[#1D1D1F]'
            }`}
          >
            My Profile
          </button>
          <button
            onClick={() => onTabChange('find')}
            className={`py-4 text-sm font-medium border-b-2 transition-all duration-200 ${
              activeTab === 'find'
                ? 'border-[#0071E3] text-[#1D1D1F]'
                : 'border-transparent text-[#86868B] hover:text-[#1D1D1F]'
            }`}
          >
            Find Professor
          </button>
        </div>
      </div>
    </div>
  );
};
