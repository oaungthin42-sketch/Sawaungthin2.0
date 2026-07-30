import React from 'react';
import { CreditGauge } from './CreditGauge';
import { Video, CreditCard, History, Zap, ArrowRight, Play } from 'lucide-react';

interface DashboardProps {
    credits: number | null;
    userName: string;
    userRole: string;
    onStartNew: () => void;
    onViewRecent: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ credits, userName, userRole, onStartNew, onViewRecent }) => {
    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Welcome Banner */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-8 sm:p-12 text-white">
                <div className="relative z-10 space-y-4 max-w-2xl">
                    <h2 className="text-4xl sm:text-5xl font-bold font-display tracking-tight">ပြန်လည်ကြိုဆိုပါသည်, {userName}!</h2>
                    <p className="text-indigo-100 text-lg sm:text-xl font-medium opacity-90">
                        အခြားဗီဒီယိုတစ်ခုကို ထပ်မံလုပ်ဆောင်ရန် အသင့်ဖြစ်ပြီလား။ သင့် AI လုပ်ငန်းခွင် အသင့်ရှိနေပါသည်။
                    </p>
                    <div className="pt-4">
                        <button 
                            onClick={onStartNew}
                            className="inline-flex items-center gap-3 bg-white text-indigo-600 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-indigo-50 transition-all shadow-xl shadow-indigo-900/20 active:scale-95"
                        >
                            <Play className="w-6 h-6 fill-indigo-600" />
                            လုပ်ငန်းအသစ် စတင်မည်
                        </button>
                    </div>
                </div>
                
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-64 h-64 bg-indigo-400/20 rounded-full blur-2xl" />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl">
                            <CreditCard className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">လက်ကျန်ငွေ</span>
                    </div>
                    <div className="flex flex-col items-center">
                        {userRole === 'admin'
                            ? <div className="text-amber-400 font-bold text-4xl flex items-center justify-center gap-2 mt-4">∞ Unlimited</div>
                            : (credits !== null ? <CreditGauge credits={credits} /> : <div className="text-5xl font-bold font-mono text-white tracking-tighter">...</div>)}
                    </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl">
                            <Zap className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">စနစ် အခြေအနေ</span>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-white font-bold">စနစ်များအားလုံး ပုံမှန်အလုပ်လုပ်နေပါသည်</span>
                        </div>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            လုပ်ဆောင်မှု ဆာဗာများ အလုပ်လုပ်နေပါသည်။ ခန့်မှန်းခြေ ကြာချိန် - ဗီဒီယိုတစ်ခုလျှင် ၂ မိနစ်ခန့်။
                        </p>
                    </div>
                </div>
            </div>

            {/* Recent Activity Placeholder */}
            <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden">
                <div className="px-8 py-6 border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <History className="w-5 h-5 text-gray-400" />
                        <h3 className="font-bold text-white">မကြာသေးမီက လုပ်ငန်းများ</h3>
                    </div>
                    <button onClick={onViewRecent} className="text-sm text-gray-500 hover:text-white transition-colors">အားလုံး ကြည့်ရန်</button>
                </div>
                <div className="p-12 text-center text-gray-500 space-y-4">
                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Video className="w-8 h-8 opacity-20" />
                    </div>
                    <p className="font-medium">မကြာသေးမီက လုပ်ငန်းများကို သင်၏ ဒေါင်းလုဒ် မီနူးတွင် ကြည့်နိုင်သည်။</p>
                    <button 
                        onClick={onViewRecent}
                        className="text-indigo-400 font-bold flex items-center gap-2 mx-auto hover:gap-3 transition-all"
                    >
                        မကြာသေးမီက ဒေါင်းလုဒ်များသို့ သွားမည် <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};
