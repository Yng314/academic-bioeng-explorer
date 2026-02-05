import React from 'react';
import { Sparkles, FileText, LayoutTemplate } from 'lucide-react';

interface ProfileSectionProps {
  userInterests: string;
  setUserInterests: (s: string) => void;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({ 
  userInterests,
  setUserInterests
}) => {
  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        
        {/* My Interests Card */}
        <div className="bg-white rounded-[24px] p-8 shadow-apple border border-black/5">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-[#0071E3]/10 flex items-center justify-center text-[#0071E3]">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-semibold text-[#1D1D1F] tracking-tight">My Research Interests</h3>
          </div>
          
          <div className="space-y-4">
            <p className="text-sm text-[#86868B] leading-relaxed">
              Define your research focus here. The AI will use these keywords to evaluate how well each professor's work aligns with your goals (High, Partial, or Low match).
            </p>
            <div className="space-y-2">
              <input 
                type="text" 
                value={userInterests}
                onChange={(e) => setUserInterests(e.target.value)}
                placeholder="e.g. Medical Imaging, Synthetic Biology, Machine Learning"
                className="w-full text-base p-4 border border-[#D2D2D7] bg-[#F5F5F7]/50 rounded-xl focus:ring-4 focus:ring-[#0071E3]/20 focus:border-[#0071E3] outline-none text-[#1D1D1F] placeholder:text-[#86868B] transition-all"
              />
              <p className="text-[11px] text-[#86868B] flex justify-between px-1">
                <span>Separate topics with commas</span>
                <span className={userInterests.length > 0 ? "text-[#0071E3] font-medium" : ""}>
                  {userInterests.split(',').filter(s => s.trim()).length} topics detected
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* My Letter Template Card (Placeholder) */}
        <div className="bg-white rounded-[24px] p-8 shadow-apple border border-black/5 opacity-60 grayscale-[0.5] relative overflow-hidden group hover:opacity-100 hover:grayscale-0 transition-all duration-300">
           <div className="absolute top-4 right-4 bg-[#F5F5F7] text-[#86868B] text-[10px] uppercase font-bold px-2 py-1 rounded-md">Coming Soon</div>
           
           <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-[#34C759]/10 flex items-center justify-center text-[#34C759]">
              <LayoutTemplate className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-semibold text-[#1D1D1F] tracking-tight">My Letter Template</h3>
          </div>
          
          <div className="space-y-4">
             <p className="text-sm text-[#86868B] leading-relaxed">
              Draft your outreach email template. In the future, we'll automatically customize this for each matched professor.
            </p>
            <textarea
              className="w-full h-40 p-4 text-sm leading-relaxed border border-[#D2D2D7] bg-[#F5F5F7]/30 rounded-xl focus:ring-4 focus:ring-[#34C759]/20 focus:border-[#34C759] outline-none resize-none text-[#1D1D1F] placeholder:text-[#86868B] transition-all cursor-not-allowed"
              placeholder="Dear Professor [Name],&#10;&#10;I am writing to express my interest in your research on..."
              disabled
            />
          </div>
        </div>

      </div>
    </div>
  );
};
