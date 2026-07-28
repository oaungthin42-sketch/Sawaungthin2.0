export const CreditGauge = ({ credits, size = 'large' }: { credits: number, size?: 'small' | 'large' }) => {
    const maxCredits = 50;
    const isZero = credits === 0;
    const fillPercentage = Math.min(Math.max(credits / maxCredits, 0), 1) * 100;
    
    if (size === 'small') {
        return (
            <div className={`flex items-center gap-2 ${isZero ? 'text-red-500' : 'text-emerald-400'}`}>
                <div className="relative w-4 h-4 rounded-full bg-gray-800 overflow-hidden border border-gray-700">
                    <div 
                        className={`absolute bottom-0 left-0 w-full transition-all duration-1000 ${isZero ? 'bg-red-500' : 'bg-emerald-500'}`} 
                        style={{ height: `${fillPercentage}%` }} 
                    />
                </div>
                <span className="text-xs font-bold">{credits} Credits</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center">
            <div className="relative w-32 h-32 rounded-full bg-gray-900 border-4 border-gray-800 overflow-hidden shadow-inner flex items-center justify-center">
                {/* Liquid fill */}
                <div 
                    className={`absolute bottom-0 left-0 w-full transition-all duration-1000 ease-in-out ${isZero ? 'bg-red-500/20' : 'bg-emerald-500/20'}`} 
                    style={{ height: `${fillPercentage}%` }} 
                >
                    <div className={`absolute top-0 left-0 w-full h-1 ${isZero ? 'bg-red-500/50' : 'bg-emerald-500/50'}`} />
                </div>
                {/* Number */}
                <div className={`relative z-10 text-5xl font-black tracking-tighter ${isZero ? 'text-red-500' : 'text-emerald-400'}`}>
                    {credits}
                </div>
            </div>
            <p className={`mt-4 text-sm font-bold uppercase tracking-widest ${isZero ? 'text-red-500/70' : 'text-emerald-500/70'}`}>
                {isZero ? 'Empty' : 'Available Credits'}
            </p>
        </div>
    );
};
