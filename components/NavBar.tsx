import React from 'react';
import { FlaskConical, Sparkles } from 'lucide-react';

interface NavBarProps {
  activeTab: 'profile' | 'find' | 'customize';
  onTabChange: (tab: 'profile' | 'find' | 'customize') => void;
}

export const NavBar: React.FC<NavBarProps> = ({ activeTab, onTabChange }) => {
  return (
    <div className="w-full bg-transparent">
      <div className="max-w-7xl mx-auto px-6 h-12 flex items-center justify-between relative">
        
        {/* LEFT: Logo & Title */}
        <div className="flex items-center gap-3 z-10">
          <div className="bg-black text-white p-1.5 rounded-lg shadow-sm">
            <FlaskConical className="w-4 h-4" />
          </div>
          <h1 className="text-sm font-semibold tracking-wide text-[#1D1D1F]">
            Professor Matcher
          </h1>
        </div>

        {/* CENTER: Navigation Tabs */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative flex gap-8">
            <button
              onClick={() => onTabChange('profile')}
              className={`py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === 'profile'
                  ? 'text-[#1D1D1F]'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              My Profile
            </button>
            <button
              onClick={() => onTabChange('find')}
              className={`py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === 'find'
                  ? 'text-[#1D1D1F]'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              Find Professor
            </button>
            <button
              onClick={() => onTabChange('customize')}
              className={`py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === 'customize'
                  ? 'text-[#1D1D1F]'
                  : 'text-[#86868B] hover:text-[#1D1D1F]'
              }`}
            >
              Customize Letter
            </button>
            
            {/* Custom Adaptive Line */}
            {/* This line sits at the bottom of the nav container, centered, slightly wider than content, fading out at ends */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-[200%] h-[1px] bg-gradient-to-r from-transparent via-black/50 to-transparent"></div>
          </div>
        </div>

        {/* RIGHT: AI Badge */}
        <div className="flex items-center gap-4 z-10">
          <div className="hidden sm:flex items-center gap-2 text-[11px] font-medium text-[#86868B] bg-[#F5F5F7] px-3 py-1 rounded-full border border-black/5">
            <Sparkles className="w-3 h-3 text-[#0071E3]" />
            <span>AI-Powered by Gemini 3 Pro</span>
          </div>
        </div>

      </div>
    </div>
  );
};
