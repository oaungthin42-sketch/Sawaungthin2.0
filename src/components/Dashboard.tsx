import React from 'react';
import { CreditGauge } from './CreditGauge';
import { CreditCard, AlertTriangle, Zap } from 'lucide-react';
import { ZawGyiHero, MyanmarStrip } from './BrandFx';

interface DashboardProps {
    credits: number | null;
    userName: string;
    userRole: string;
    onStartNew: () => void;
    onViewRecent: () => void;
}

const RULES = [
    { c: 1, t: '1 မိနစ် 15 စက္ကန့်အထိ' },
    { c: 2, t: '2 မိနစ် 15 စက္ကန့်အထိ' },
    { c: 3, t: '3 မိနစ် 15 စက္ကန့်အထိ' },
];

export const Dashboard: React.FC<DashboardProps> = ({ credits, userName, userRole, onStartNew, onViewRecent }) => {
    void userName; void onViewRecent;
    return (
        <div className="space-y-5 animate-in fade-in duration-700">
            <div className="relative overflow-hidden rounded-[26px] min-h-[300px] md:h-[316px] border border-[rgba(255,160,60,0.28)] shadow-[0_24px_60px_rgba(214,31,60,0.22)]"
                style={{ background: 'radial-gradient(120% 140% at 80% 40%,#7A1E10 0%,#3A0E0A 45%,#150708 100%)' }}>
                <ZawGyiHero className="absolute right-[-40px] md:right-0 top-0 h-full w-auto opacity-50 md:opacity-100 pointer-events-none select-none" />
                <div className="relative z-10 p-7 sm:p-11 pb-12">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-[#FFD9A8]">SuperClick AI</span>
                    <h2 className="sc-title3d font-bold leading-[1.15] mt-3 text-[34px] sm:text-[54px]">မြန်မာဗားစင်း</h2>
                    <div className="sc-title3d font-display font-bold leading-[1.15] text-[30px] sm:text-[46px]">Movie Recap</div>
                    <button type="button" onClick={onStartNew} className="btn-brand mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm">
                        <Zap className="w-4 h-4" />စတင်မည်
                    </button>
                </div>
                <MyanmarStrip className="absolute left-0 bottom-0" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-5">
                <div className="bg-gray-900 border border-gray-800 p-6 rounded-[20px] flex flex-col justify-center gap-3">
                    <div className="flex items-center gap-3 text-gray-500 text-[13px]">
                        <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl"><CreditCard className="w-5 h-5" /></div>
                        လက်ကျန်ငွေ
                    </div>
                    <div className="flex flex-col items-center">
                        {userRole === 'admin'
                            ? <div className="sc-gradient-text font-display font-bold text-4xl mt-2">∞ Unlimited</div>
                            : (credits !== null ? <CreditGauge credits={credits} /> : <div className="text-5xl font-bold font-mono text-white tracking-tighter">...</div>)}
                    </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 p-6 rounded-[20px]">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl"><AlertTriangle className="w-5 h-5" /></div>
                        <b className="text-white text-base">Credit စည်းမျဉ်း</b>
                    </div>
                    <ul className="space-y-1">
                        {RULES.map(r => (
                            <li key={r.c} className="flex items-center gap-3 py-1.5 text-sm text-gray-300">
                                <span className="btn-brand px-3 py-1 rounded-full text-xs font-bold" style={{ boxShadow: 'none' }}>{r.c} Credit</span>
                                {r.t}
                            </li>
                        ))}
                    </ul>
                    <p className="text-[13px] text-gray-500 mt-2">… ဤအတိုင်း တိုးသွားမည်</p>
                    <p className="text-[13px] font-semibold text-red-400 mt-1">Credit မလုံလောက်ပါက လုပ်ဆောင်၍ မရပါ</p>
                </div>
            </div>
        </div>
    );
};
