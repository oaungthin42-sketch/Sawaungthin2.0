import React, { useState, useEffect } from 'react';
import { Users, UserMinus, UserCheck, Search, Loader2, ArrowLeft, MessageSquare, List, Star, CreditCard, Check, X, Settings } from 'lucide-react';
import axios from 'axios';

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    credits: number;
    created_at: string;
    last_login: string | null;
}

interface Job {
    id: string;
    status: string;
    progress: number;
    originalFilename: string;
    userName: string;
    userEmail: string;
    created_at: number;
}

interface Feedback {
    id: string;
    userName: string;
    userEmail: string;
    rating: number;
    comment: string;
    adminReply?: string;
    created_at: string;
    jobId: string;
}

interface PaymentRequest {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    slipImagePath: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    reviewed_at: string | null;
}

interface AdminPageProps {
    onBack: () => void;
    initialTab?: 'users' | 'jobs' | 'feedback' | 'payments' | 'settings';
}

export const AdminPage: React.FC<AdminPageProps> = ({ onBack, initialTab }) => {
    const [activeTab, setActiveTab] = useState<'users' | 'jobs' | 'feedback' | 'payments' | 'settings'>(initialTab || 'users');
    const [users, setUsers] = useState<User[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [feedback, setFeedback] = useState<Feedback[]>([]);
    const [payments, setPayments] = useState<PaymentRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [creditAmounts, setCreditAmounts] = useState<Record<string, number>>({});
    const [creditInputs, setCreditInputs] = useState<Record<string, string>>({});
    const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [settingsValues, setSettingsValues] = useState<Record<string, string>>({});
    const [totalUserCount, setTotalUserCount] = useState<number | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [showFeedbackHistory, setShowFeedbackHistory] = useState(false);

    useEffect(() => {
        axios.get('/api/user/admin/users')
            .then(res => setTotalUserCount(res.data.length))
            .catch(() => {});
    }, []);

    const fetchData = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            if (activeTab === 'users') {
                const res = await axios.get('/api/user/admin/users', { params: { _t: Date.now() } });
                setUsers(res.data);
            } else if (activeTab === 'jobs') {
                const res = await axios.get('/api/user/admin/jobs');
                setJobs(res.data);
            } else if (activeTab === 'feedback') {
                const res = await axios.get('/api/user/admin/feedback');
                setFeedback(res.data);
            } else if (activeTab === 'payments') {
                const res = await axios.get('/api/user/admin/payment-requests');
                setPayments(res.data);
            } else if (activeTab === 'settings') {
                const res = await axios.get('/api/settings');
                const mapped: Record<string, string> = {};
                Object.entries(res.data).forEach(([key, data]: [string, any]) => {
                    if (data.value !== undefined) {
                        mapped[key] = data.value;
                    }
                });
                setSettingsValues(mapped);
            }
        } catch (err: any) {
            console.error('Failed to fetch data', err);
            setErrorMsg(err.response?.data?.error || err.message || 'Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const handleCredits = async (userId: string, amount: number) => {
        console.log(`[CREDITS] Sending request: userId=${userId}, amount=${amount}`);
        try {
            const res = await axios.post(`/api/user/admin/users/${userId}/credits`, { amount });
            console.log(`[CREDITS] Success:`, res.data);
            await fetchData();
            setCreditInputs(prev => ({ ...prev, [userId]: '' }));
            alert(amount > 0 ? `Added ${amount} credits.` : `Subtracted ${Math.abs(amount)} credits.`);
        } catch (err: any) {
            console.error(`[CREDITS] Failed:`, err.response?.status, err.response?.data, err.message);
            alert(`Credit update failed: ${err.response?.data?.error || err.message}`);
        }
    };

    const handleReplyFeedback = async (feedbackId: string) => {
        const reply = replyInputs[feedbackId];
        if (!reply) return;
        try {
            await axios.post(`/api/user/admin/feedback/${feedbackId}/reply`, { reply });
            fetchData();
            setReplyInputs(prev => ({ ...prev, [feedbackId]: '' }));
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to send reply');
        }
    };

    const toggleStatus = async (user: User) => {
        try {
            const action = user.status === 'active' ? 'suspend' : 'activate';
            await axios.post(`/api/user/admin/users/${user.id}/${action}`);
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update status');
        }
    };

    const handleApprovePayment = async (id: string, credits: number) => {
        try {
            await axios.post(`/api/user/admin/payment-requests/${id}/approve`, { credits });
            fetchData();
        } catch (e: any) {
            alert(e.response?.data?.error || 'Failed to approve payment');
        }
    };

    const handleRejectPayment = async (id: string) => {
        try {
            await axios.post(`/api/user/admin/payment-requests/${id}/reject`);
            fetchData();
        } catch (e: any) {
            alert(e.response?.data?.error || 'Failed to reject payment');
        }
    };

    const filteredUsers = users.filter(u => 
        u.email?.toLowerCase().includes(search.toLowerCase()) || 
        u.name?.toLowerCase().includes(search.toLowerCase())
    );

    const filteredJobs = jobs.filter(j => 
        j.originalFilename?.toLowerCase().includes(search.toLowerCase()) ||
        j.userName?.toLowerCase().includes(search.toLowerCase()) ||
        j.id.toLowerCase().includes(search.toLowerCase())
    );

    const filteredFeedback = feedback.filter(f => 
        f.userName?.toLowerCase().includes(search.toLowerCase()) ||
        f.comment?.toLowerCase().includes(search.toLowerCase())
    );

    const sortedFilteredUsers = [...filteredUsers].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const sortedFilteredJobs = [...filteredJobs].sort((a, b) => b.created_at - a.created_at);

    const searchedSortedPayments = [...payments]
        .filter(p => p.userEmail?.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const pendingPayments = searchedSortedPayments.filter(p => p.status === 'pending');
    const processedPayments = searchedSortedPayments.filter(p => p.status !== 'pending');

    const sortedFeedback = [...filteredFeedback].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const needsReply = sortedFeedback.filter(item => !item.adminReply);
    const alreadyReplied = sortedFeedback.filter(item => item.adminReply);

    const renderPaymentTable = (list: PaymentRequest[]) => (
        <table className="w-full text-left hidden sm:table">
            <thead>
                <tr className="bg-gray-950/50 border-b border-gray-800">
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">အသုံးပြုသူ</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">ဖြတ်ပိုင်း</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">အခြေအနေ</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">လုပ်ဆောင်ချက်</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
                {list.map(req => (
                    <tr key={req.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-4">
                            <div className="flex flex-col">
                                <span className="font-semibold text-white">{req.userName}</span>
                                <span className="text-xs text-gray-500 font-mono">{req.userEmail}</span>
                                <span className="text-[10px] text-gray-600 mt-1 uppercase font-bold tracking-tighter">{new Date(req.created_at).toLocaleDateString()}</span>
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            <a href={req.slipImagePath} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 text-xs font-bold underline">ဖြတ်ပိုင်းကြည့်ရန်</a>
                        </td>
                        <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-tight ${req.status === 'approved' ? 'bg-green-500/10 text-green-400' : req.status === 'rejected' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                {req.status.toUpperCase()}
                            </span>
                        </td>
                        <td className="px-6 py-4">
                            {req.status === 'pending' && (
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="number" 
                                        className="w-16 bg-gray-950 border border-gray-800 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="Cr"
                                        value={creditAmounts[req.id] || ''}
                                        onChange={e => setCreditAmounts({ ...creditAmounts, [req.id]: parseInt(e.target.value) || 0 })}
                                    />
                                    <button 
                                        onClick={() => handleApprovePayment(req.id, creditAmounts[req.id] || 0)}
                                        disabled={!creditAmounts[req.id]}
                                        className="p-1.5 bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white rounded-lg transition-all disabled:opacity-50 disabled:pointer-events-none"
                                        title="အတည်ပြုရန်"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleRejectPayment(req.id)}
                                        className="p-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-all"
                                        title="ပယ်ချရန်"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderPaymentCardList = (list: PaymentRequest[]) => (
        <div className="sm:hidden divide-y divide-gray-800">
            {list.map(req => (
                <div key={req.id} className="p-4 space-y-4 hover:bg-gray-800/20 transition-colors">
                    <div className="flex flex-col">
                        <span className="font-semibold text-white">{req.userName}</span>
                        <span className="text-xs text-gray-500 font-mono break-all">{req.userEmail}</span>
                        <span className="text-[10px] text-gray-600 mt-1 uppercase font-bold tracking-tighter">{new Date(req.created_at).toLocaleDateString()}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                        <a href={req.slipImagePath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-bold rounded-lg transition-all underline">
                            ဖြတ်ပိုင်းကြည့်ရန်
                        </a>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-tight ${req.status === 'approved' ? 'bg-green-500/10 text-green-400' : req.status === 'rejected' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                            {req.status.toUpperCase()}
                        </span>
                    </div>

                    {req.status === 'pending' && (
                        <div className="space-y-2 bg-gray-950/40 p-3 rounded-xl border border-gray-800">
                            <label className="block text-xs font-bold text-gray-400 mb-1">သတ်မှတ်မည့် Credits:</label>
                            <input 
                                type="number" 
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 text-center"
                                placeholder="Credits အရေအတွက်"
                                value={creditAmounts[req.id] || ''}
                                onChange={e => setCreditAmounts({ ...creditAmounts, [req.id]: parseInt(e.target.value) || 0 })}
                            />
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleApprovePayment(req.id, creditAmounts[req.id] || 0)}
                                    disabled={!creditAmounts[req.id]}
                                    className="flex-1 py-2.5 bg-green-500 text-white hover:bg-green-600 rounded-lg transition-all font-bold text-xs disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] flex items-center justify-center gap-1.5"
                                >
                                    <Check className="w-4 h-4" /> အတည်ပြုမည်
                                </button>
                                <button 
                                    onClick={() => handleRejectPayment(req.id)}
                                    className="flex-1 py-2.5 bg-red-500 text-white hover:bg-red-600 rounded-lg transition-all font-bold text-xs active:scale-[0.98] flex items-center justify-center gap-1.5"
                                >
                                    <X className="w-4 h-4" /> ပယ်ချမည်
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    const renderFeedbackItem = (item: Feedback) => (
        <div key={item.id} className="p-4 sm:p-6 hover:bg-gray-800/30 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
                <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <div className="flex gap-0.5">
                            {[1,2,3,4,5].map(s => (
                                <Star key={s} className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${s <= item.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-700'}`} />
                            ))}
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-white">{item.userName}</span>
                        <span className="text-[11px] sm:text-xs text-gray-500 break-all font-mono">{item.userEmail}</span>
                    </div>
                    <p className="text-gray-300 text-xs sm:text-sm leading-relaxed">{item.comment || <span className="italic text-gray-600">မှတ်ချက်မရှိပါ</span>}</p>
                    {item.adminReply && (
                        <div className="mt-2 p-3 bg-indigo-900/20 border border-indigo-500/20 rounded-xl">
                            <p className="text-[10px] sm:text-xs font-bold text-indigo-400 mb-1">Admin ပြန်စာ</p>
                            <p className="text-xs sm:text-sm text-indigo-100">{item.adminReply}</p>
                        </div>
                    )}
                    <div className="text-[9px] sm:text-[10px] text-gray-600 font-mono">Job ID: {item.jobId || 'N/A'}</div>
                    {!item.adminReply && (
                        <div className="mt-4 flex flex-col gap-2">
                            <textarea 
                                placeholder="ပြန်စာရေးရန်..."
                                value={replyInputs[item.id] || ''}
                                onChange={e => setReplyInputs({ ...replyInputs, [item.id]: e.target.value })}
                                className="w-full bg-gray-950/50 border border-gray-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500 resize-none h-16 sm:h-20"
                            />
                            <button 
                                disabled={!replyInputs[item.id]}
                                onClick={() => handleReplyFeedback(item.id)}
                                className="self-end px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] sm:text-xs font-bold rounded-lg transition-all disabled:opacity-50 disabled:pointer-events-none"
                            >
                                ပြန်စာပို့ရန်
                            </button>
                        </div>
                    )}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-500 sm:text-right shrink-0">
                    {new Date(item.created_at).toLocaleString()}
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-3 sm:p-8 w-full max-w-full overflow-x-hidden">
            <div className="max-w-6xl mx-auto space-y-4 sm:space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-900 pb-2 sm:pb-0">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onBack}
                            className="p-2 hover:bg-gray-900 rounded-xl transition-colors text-gray-400 hover:text-white animate-fade-in"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-xl">
                            <Users className="w-4 h-4 text-indigo-400" />
                            <span className="text-xs text-gray-400">စုစုပေါင်း:</span>
                            <span className="text-xs font-bold text-white font-mono">
                                {totalUserCount !== null ? totalUserCount : '...'}
                            </span>
                        </div>
                    </div>
                    
                    {errorMsg && (
                        <div className="w-full mt-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl font-medium text-xs sm:text-sm">
                            {errorMsg}
                        </div>
                    )}

                    <div className="flex items-center justify-between sm:justify-start gap-1 sm:gap-2 p-1 bg-gray-900 border border-gray-800 rounded-2xl w-full sm:w-auto mt-2 sm:mt-0">
                        <button 
                            onClick={() => setActiveTab('users')}
                            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 p-3 sm:px-4 sm:py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                            title="အသုံးပြုသူများ"
                        >
                            <Users className="w-5 h-5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">အသုံးပြုသူများ</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('jobs')}
                            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 p-3 sm:px-4 sm:py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${activeTab === 'jobs' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                            title="လုပ်ငန်းများ"
                        >
                            <List className="w-5 h-5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">လုပ်ငန်းများ</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('feedback')}
                            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 p-3 sm:px-4 sm:py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${activeTab === 'feedback' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                            title="မှတ်ချက်များ"
                        >
                            <MessageSquare className="w-5 h-5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">မှတ်ချက်များ</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('payments')}
                            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 p-3 sm:px-4 sm:py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${activeTab === 'payments' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                            title="ငွေပေးချေမှုများ"
                        >
                            <CreditCard className="w-5 h-5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">ငွေပေးချေမှုများ</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('settings')}
                            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 p-3 sm:px-4 sm:py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                            title="ဆက်တင်များ"
                        >
                            <Settings className="w-5 h-5 sm:w-4 sm:h-4" /> <span className="hidden sm:inline">ဆက်တင်များ</span>
                        </button>
                    </div>
                </div>

                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-indigo-400 transition-colors" />
                    <input 
                        type="text" 
                        placeholder="ရှာဖွေရန်..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded-2xl pl-12 pr-6 py-3 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm"
                    />
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
                        <p className="text-gray-500 font-medium text-sm">ဆာဗာနှင့် ချိတ်ဆက်နေသည်...</p>
                    </div>
                ) : (
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
                        {activeTab === 'users' && (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left hidden sm:table">
                                        <thead>
                                            <tr className="bg-gray-950/50 border-b border-gray-800">
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">အသုံးပြုသူ</th>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">အခြေအနေ</th>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Credits</th>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">နောက်ဆုံး ဝင်ရောက်ချိန်</th>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">လုပ်ဆောင်ချက်များ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800">
                                            {sortedFilteredUsers.map(user => (
                                                <tr key={user.id} className="hover:bg-gray-800/30 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-white group-hover:text-indigo-300 transition-colors">{user.name}</span>
                                                            <span className="text-xs text-gray-500 font-mono">{user.email}</span>
                                                            <span className="text-[10px] text-gray-600 mt-1 uppercase font-bold tracking-tighter">အကောင့်ဖွင့်ရက် {new Date(user.created_at).toLocaleDateString()}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-tight ${user.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                                            <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                                                            {user.status.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-xl font-bold font-mono text-white w-8">{user.credits}</span>
                                                            <div className="flex items-center gap-2">
                                                                <input 
                                                                    type="number" 
                                                                    placeholder="Amount" 
                                                                    value={creditInputs[user.id] || ''}
                                                                    onChange={e => setCreditInputs({...creditInputs, [user.id]: e.target.value})}
                                                                    className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500" 
                                                                />
                                                                {(() => {
                                                                    const amt = Number(creditInputs[user.id]);
                                                                    const isValid = creditInputs[user.id] && !isNaN(amt) && amt > 0;
                                                                    return (
                                                                        <>
                                                                            <button disabled={!isValid} onClick={() => handleCredits(user.id, amt)} className="px-2 py-1 bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white rounded-lg transition-all text-xs font-bold disabled:opacity-30 disabled:pointer-events-none">Add</button>
                                                                            <button disabled={!isValid} onClick={() => handleCredits(user.id, -amt)} className="px-2 py-1 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-all text-xs font-bold disabled:opacity-30 disabled:pointer-events-none">Subtract</button>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-medium text-gray-400">
                                                            {user.last_login ? new Date(user.last_login).toLocaleString() : 'မရှိပါ'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button onClick={() => toggleStatus(user)} disabled={user.role === 'admin'} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${user.status === 'active' ? 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white shadow-lg shadow-red-900/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white shadow-lg shadow-green-900/20'}`}>
                                                            {user.status === 'active' ? <><UserMinus className="w-4 h-4" /> ပိတ်ရန်</> : <><UserCheck className="w-4 h-4" /> ဖွင့်ရန်</>}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="sm:hidden divide-y divide-gray-800">
                                    {sortedFilteredUsers.map(user => (
                                        <div key={user.id} className="p-4 space-y-4 group hover:bg-gray-800/20 transition-colors">
                                            {/* name + email + signup date on top */}
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-white text-base group-hover:text-indigo-300 transition-colors">{user.name}</span>
                                                <span className="text-xs text-gray-500 font-mono break-all">{user.email}</span>
                                                <span className="text-[10px] text-gray-600 mt-1 uppercase font-bold tracking-tighter">အကောင့်ဖွင့်ရက် {new Date(user.created_at).toLocaleDateString()}</span>
                                            </div>

                                            {/* status pill */}
                                            <div>
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-tight ${user.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                                                    {user.status.toUpperCase()}
                                                </span>
                                            </div>

                                            {/* credits number with add/subtract inputs and buttons stacked below */}
                                            <div className="space-y-2 bg-gray-950/40 p-3 rounded-xl border border-gray-800">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-medium text-gray-400">ရှိပြီးသား Credits:</span>
                                                    <span className="text-xl font-bold font-mono text-white">{user.credits}</span>
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <input 
                                                        type="number" 
                                                        placeholder="Amount" 
                                                        value={creditInputs[user.id] || ''}
                                                        onChange={e => setCreditInputs({...creditInputs, [user.id]: e.target.value})}
                                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 text-center" 
                                                    />
                                                    {(() => {
                                                        const amt = Number(creditInputs[user.id]);
                                                        const isValid = creditInputs[user.id] && !isNaN(amt) && amt > 0;
                                                        return (
                                                            <div className="flex gap-2">
                                                                <button 
                                                                    disabled={!isValid} 
                                                                    onClick={() => handleCredits(user.id, amt)} 
                                                                    className="flex-1 py-2.5 bg-green-500/15 hover:bg-green-500 text-green-500 hover:text-white rounded-lg transition-all text-xs font-bold disabled:opacity-30 disabled:pointer-events-none active:scale-[0.98]"
                                                                >
                                                                    Add
                                                                </button>
                                                                <button 
                                                                    disabled={!isValid} 
                                                                    onClick={() => handleCredits(user.id, -amt)} 
                                                                    className="flex-1 py-2.5 bg-red-500/15 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-all text-xs font-bold disabled:opacity-30 disabled:pointer-events-none active:scale-[0.98]"
                                                                >
                                                                    Subtract
                                                                </button>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            {/* last login */}
                                            <div className="flex justify-between items-center text-xs text-gray-500">
                                                <span>နောက်ဆုံး ဝင်ရောက်ချိန်:</span>
                                                <span className="font-medium">
                                                    {user.last_login ? new Date(user.last_login).toLocaleString() : 'မရှိပါ'}
                                                </span>
                                            </div>

                                            {/* suspend/activate button full-width at the bottom of the card */}
                                            <div>
                                                <button 
                                                    onClick={() => toggleStatus(user)} 
                                                    disabled={user.role === 'admin'} 
                                                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none ${user.status === 'active' ? 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white shadow-lg shadow-red-900/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white shadow-lg shadow-green-900/20'}`}
                                                >
                                                    {user.status === 'active' ? <><UserMinus className="w-4 h-4" /> ပိတ်ရန်</> : <><UserCheck className="w-4 h-4" /> ဖွင့်ရန်</>}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {sortedFilteredUsers.length === 0 && (
                                        <div className="p-12 text-center text-gray-500 italic">အသုံးပြုသူများ မရှိပါ။</div>
                                    )}
                                </div>
                            </>
                        )}

                        {activeTab === 'jobs' && (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left hidden sm:table">
                                        <thead>
                                            <tr className="bg-gray-950/50 border-b border-gray-800">
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">လုပ်ငန်း / အသုံးပြုသူ</th>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">အခြေအနေ</th>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">ရက်စွဲ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800">
                                            {sortedFilteredJobs.map(job => (
                                                <tr key={job.id} className="hover:bg-gray-800/30 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-white truncate max-w-xs">{job.originalFilename || 'အမည်မရှိသော ဗီဒီယို'}</span>
                                                            <span className="text-xs text-gray-400">{job.userName} ({job.userEmail})</span>
                                                            <span className="text-[10px] text-gray-600 mt-1 font-mono">{job.id}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-tight ${
                                                            job.status === 'complete' ? 'bg-green-500/10 text-green-400' : 
                                                            job.status === 'error' ? 'bg-red-500/10 text-red-400' : 
                                                            'bg-indigo-500/10 text-indigo-400'
                                                        }`}>
                                                            {job.status.toUpperCase()}
                                                            {job.status === 'processing' && <span className="text-[10px] opacity-70">({Math.round(job.progress)}%)</span>}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-500">
                                                        {new Date(job.created_at).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="sm:hidden divide-y divide-gray-800">
                                    {sortedFilteredJobs.map(job => (
                                        <div key={job.id} className="p-4 space-y-3 hover:bg-gray-800/20 transition-colors">
                                            {/* filename + user info on top */}
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-white break-words text-sm">{job.originalFilename || 'အမည်မရှိသော ဗီဒီယို'}</span>
                                                <span className="text-xs text-gray-400 mt-1">{job.userName} ({job.userEmail})</span>
                                                <span className="text-[10px] text-gray-600 font-mono mt-0.5">{job.id}</span>
                                            </div>

                                            {/* status pill */}
                                            <div>
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-tight ${
                                                    job.status === 'complete' ? 'bg-green-500/10 text-green-400' : 
                                                    job.status === 'error' ? 'bg-red-500/10 text-red-400' : 
                                                    'bg-indigo-500/10 text-indigo-400'
                                                }`}>
                                                    {job.status.toUpperCase()}
                                                    {job.status === 'processing' && <span className="text-[10px] opacity-70">({Math.round(job.progress)}%)</span>}
                                                </span>
                                            </div>

                                            {/* date */}
                                            <div className="text-xs text-gray-500 flex justify-between">
                                                <span>ရက်စွဲ:</span>
                                                <span>{new Date(job.created_at).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {sortedFilteredJobs.length === 0 && (
                                        <div className="p-12 text-center text-gray-500 italic">လုပ်ငန်းများ မရှိပါ။</div>
                                    )}
                                </div>
                            </>
                        )}

                        {activeTab === 'feedback' && (
                            <div className="p-0 space-y-6">
                                {/* Needs Reply Section */}
                                <div className="space-y-3 p-4 sm:p-6 pb-0">
                                    <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-gray-800 pb-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                                        ပြန်စာပေးရန် လိုအပ်သည် ({needsReply.length})
                                    </h3>
                                    {needsReply.length === 0 ? (
                                        <div className="p-8 text-center text-gray-500 italic text-sm">ပြန်စာပေးရန် လိုအပ်သော မှတ်ချက် မရှိပါ။</div>
                                    ) : (
                                        <div className="divide-y divide-gray-800 border border-gray-800 rounded-2xl overflow-hidden bg-gray-950/10 animate-fade-in">
                                            {needsReply.map(renderFeedbackItem)}
                                        </div>
                                    )}
                                </div>

                                {/* Already Replied Section (Collapsible) */}
                                <div className="space-y-3 p-4 sm:p-6 pt-0">
                                    <button 
                                        onClick={() => setShowFeedbackHistory(!showFeedbackHistory)}
                                        className="w-full flex items-center justify-between p-3 bg-gray-950/40 border border-gray-800/80 hover:bg-gray-800/40 transition-all rounded-xl text-left"
                                    >
                                        <span className="text-sm font-bold text-gray-300 flex items-center gap-2">
                                            <MessageSquare className="w-4 h-4 text-indigo-400" />
                                            ပြန်စာပေးပြီးသား ({alreadyReplied.length})
                                        </span>
                                        <span className="text-xs font-bold text-gray-500 font-mono">
                                            {showFeedbackHistory ? '▾ ပိတ်ရန်' : '▸ ဖွင့်ရန်'}
                                        </span>
                                    </button>

                                    {showFeedbackHistory && (
                                        alreadyReplied.length === 0 ? (
                                            <div className="p-8 text-center text-gray-500 italic text-sm">မှတ်တမ်း မရှိပါ။</div>
                                        ) : (
                                            <div className="divide-y divide-gray-800 border border-gray-800 rounded-2xl overflow-hidden bg-gray-950/10">
                                                {alreadyReplied.map(renderFeedbackItem)}
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'payments' && (
                            <div className="p-4 sm:p-6 space-y-6">
                                {/* Pending Payments Section */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                                            စောင့်ဆိုင်းနေသည် ({pendingPayments.length})
                                        </h3>
                                    </div>
                                    {pendingPayments.length === 0 ? (
                                        <div className="p-8 text-center text-gray-500 italic text-sm">စောင့်ဆိုင်းနေသော ငွေလွှဲတောင်းဆိုမှု မရှိပါ။</div>
                                    ) : (
                                        <div className="bg-gray-950/20 border border-gray-800 rounded-2xl overflow-hidden">
                                            {renderPaymentTable(pendingPayments)}
                                            {renderPaymentCardList(pendingPayments)}
                                        </div>
                                    )}
                                </div>

                                {/* Processed Payments Section (Collapsible) */}
                                <div className="space-y-3 pt-2">
                                    <button 
                                        onClick={() => setShowHistory(!showHistory)}
                                        className="w-full flex items-center justify-between p-3 bg-gray-950/40 border border-gray-800/80 hover:bg-gray-800/40 transition-all rounded-xl text-left"
                                    >
                                        <span className="text-sm font-bold text-gray-300 flex items-center gap-2">
                                            <CreditCard className="w-4 h-4 text-indigo-400" />
                                            ပြီးစီးပြီးသား မှတ်တမ်း ({processedPayments.length})
                                        </span>
                                        <span className="text-xs font-bold text-gray-500 font-mono">
                                            {showHistory ? '▾ ပိတ်ရန်' : '▸ ဖွင့်ရန်'}
                                        </span>
                                    </button>
                                    
                                    {showHistory && (
                                        processedPayments.length === 0 ? (
                                            <div className="p-8 text-center text-gray-500 italic text-sm">မှတ်တမ်း မရှိပါ။</div>
                                        ) : (
                                            <div className="bg-gray-950/20 border border-gray-800 rounded-2xl overflow-hidden">
                                                {renderPaymentTable(processedPayments)}
                                                {renderPaymentCardList(processedPayments)}
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="p-4 sm:p-8 space-y-8 max-w-2xl">
                                <h2 className="text-xl font-bold text-white">စနစ် ဆက်တင်များ</h2>

                                <div className="space-y-4 pb-8 border-b border-gray-800">
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide">ဘဏ်အချက်အလက်</h3>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-2">ဘဏ်အမျိုးအစား</label>
                                        <input
                                            type="text"
                                            value={settingsValues['BANK_NAME'] || ''}
                                            onChange={(e) => setSettingsValues({ ...settingsValues, BANK_NAME: e.target.value })}
                                            placeholder="K PLUS"
                                            className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm focus:border-indigo-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-2">ဘဏ် Account Number</label>
                                        <input
                                            type="text"
                                            value={settingsValues['BANK_ACCOUNT_NUMBER'] || ''}
                                            onChange={(e) => setSettingsValues({ ...settingsValues, BANK_ACCOUNT_NUMBER: e.target.value })}
                                            placeholder="2288440657"
                                            className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm font-mono focus:border-indigo-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-2">Account Name</label>
                                        <input
                                            type="text"
                                            value={settingsValues['BANK_ACCOUNT_NAME'] || ''}
                                            onChange={(e) => setSettingsValues({ ...settingsValues, BANK_ACCOUNT_NAME: e.target.value })}
                                            placeholder="AUNG THIN OO"
                                            className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm focus:border-indigo-500 outline-none"
                                        />
                                    </div>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await axios.post('/api/settings', { key: 'BANK_NAME', value: settingsValues['BANK_NAME'] || '' });
                                                await axios.post('/api/settings', { key: 'BANK_ACCOUNT_NUMBER', value: settingsValues['BANK_ACCOUNT_NUMBER'] || '' });
                                                await axios.post('/api/settings', { key: 'BANK_ACCOUNT_NAME', value: settingsValues['BANK_ACCOUNT_NAME'] || '' });
                                                alert('ဘဏ်အချက်အလက် Save လုပ်ပြီးပါပြီ');
                                                fetchData();
                                            } catch (err: any) {
                                                alert(err.response?.data?.error || 'Save မလုပ်နိုင်ပါ');
                                            }
                                        }}
                                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all"
                                    >
                                        ဘဏ်အချက်အလက် Save
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wide">Telegram Support Link</h3>
                                    <input
                                        type="text"
                                        value={settingsValues['TELEGRAM_LINK'] || ''}
                                        onChange={(e) => setSettingsValues({ ...settingsValues, TELEGRAM_LINK: e.target.value })}
                                        placeholder="https://t.me/your_username"
                                        className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm focus:border-indigo-500 outline-none"
                                    />
                                    <button
                                        onClick={async () => {
                                            try {
                                                await axios.post('/api/settings', { key: 'TELEGRAM_LINK', value: settingsValues['TELEGRAM_LINK'] || '' });
                                                alert('Telegram Link Save လုပ်ပြီးပါပြီ');
                                                fetchData();
                                            } catch (err: any) {
                                                alert(err.response?.data?.error || 'Save မလုပ်နိုင်ပါ');
                                            }
                                        }}
                                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all"
                                    >
                                        Telegram Link Save
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
