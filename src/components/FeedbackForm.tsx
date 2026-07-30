import React, { useState } from 'react';
import { Star, Send, Loader2, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

interface FeedbackFormProps {
    jobId: string | null;
    onSuccess?: () => void;
}

export const FeedbackForm: React.FC<FeedbackFormProps> = ({ jobId, onSuccess }) => {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (rating === 0) return;
        
        setLoading(true);
        try {
            await axios.post('/api/user/feedback', {
                jobId,
                rating,
                comment
            });
            setSubmitted(true);
            if (onSuccess) onSuccess();
        } catch (err) {
            console.error('Failed to submit feedback', err);
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="bg-emerald-500/5 border border-emerald-500/20 p-8 rounded-3xl text-center space-y-4 animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-white">အကြံပြုချက်ပေးရန် ကျေးဇူးတင်ပါသည်!</h3>
                <p className="text-gray-400 text-sm max-w-sm mx-auto">သင့်အကြံပြုချက်သည် ကျွန်ုပ်တို့၏ AI ကို ပိုမိုကောင်းမွန်အောင် ကူညီပေးပါသည်။</p>
            </div>
        );
    }

    return (
        <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl space-y-6">
            <div className="space-y-1 text-center">
                <h3 className="text-xl font-bold text-white">အရည်အသွေးကို အမှတ်ပေးရန်</h3>
                <p className="text-gray-400 text-sm">မြန်မာအသံထပ်မှုအပေါ် မည်မျှကျေနပ်မှုရှိပါသလဲ?</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <button
                            key={star}
                            type="button"
                            onClick={() => setRating(star)}
                            onMouseEnter={() => setHover(star)}
                            onMouseLeave={() => setHover(0)}
                            className="p-1 focus:outline-none transition-transform active:scale-90"
                        >
                            <Star 
                                className={`w-10 h-10 transition-colors ${
                                    (hover || rating) >= star 
                                    ? 'text-amber-400 fill-amber-400' 
                                    : 'text-gray-700'
                                }`} 
                            />
                        </button>
                    ))}
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1">အခြား မှတ်ချက်များ (ရွေးချယ်နိုင်သည်)</label>
                    <textarea 
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="သင်နှစ်သက်သောအရာ သို့မဟုတ် ပိုကောင်းသင့်သောအရာကို ပြောပြပါ..."
                        className="w-full bg-gray-950 border border-gray-800 rounded-2xl p-4 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 min-h-[100px] transition-all"
                    />
                </div>

                <button
                    type="submit"
                    disabled={rating === 0 || loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-indigo-900/20"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    အကြံပြုမည်
                </button>
            </form>
        </div>
    );
};
