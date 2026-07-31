import React, { useState, useEffect } from 'react';
import { Users, Shield, UserMinus, UserCheck, Search, Loader2, ArrowLeft, MessageSquare, List, Star, CreditCard, Check, X, Settings } from 'lucide-react';
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

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-8 w-full max-w-full overflow-x-hidden">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={onBack}
                            className="p-2 hover:bg-gray-900 rounded-xl transition-colors text-gray-400 hover:text-white"
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl">
                                <Shield className="w-8 h-8" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold font-display tracking-tight">စီမံခန့်ခွဲသူ ဧရိယာ</h1>
                                <p className="text-gray-500 text-sm font-medium">စနစ် စီမံခန့်ခွဲမှု</p>
                            </div>
                        </div>
                    </div>
                    
                    {errorMsg && (
                        <div className="w-full mt-4 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl font-medium">
                            {errorMsg}
                        </div>
                    )}

                    <div className="flex items-center gap-2 p-1 bg-gray-900 border border-gray-800 rounded-2xl mt-6 sm:mt-0 overflow-x-auto max-w-full custom-scrollbar">
                        <button 
                            onClick={() => setActiveTab('users')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Users className="w-4 h-4" /> အသုံးပြုသူများ
                        </button>
                        <button 
                            onClick={() => setActiveTab('jobs')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${activeTab === 'jobs' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            <List className="w-4 h-4" /> လုပ်ငန်းများ
                        </button>
                        <button 
                            onClick={() => setActiveTab('feedback')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${activeTab === 'feedback' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            <MessageSquare className="w-4 h-4" /> မှတ်ချက်များ
                        </button>
                        <button 
                            onClick={() => setActiveTab('payments')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${activeTab === 'payments' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            <CreditCard className="w-4 h-4" /> ငွေပေးချေမှုများ
                        </button>
                        <button 
                            onClick={() => setActiveTab('settings')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Settings className="w-4 h-4" /> ဆက်တင်များ
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
                        className="bg-gray-900 border border-gray-800 rounded-2xl pl-12 pr-6 py-3 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    />
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
                        <p className="text-gray-500 font-medium">ဆာဗာနှင့် ချိတ်ဆက်နေသည်...</p>
                    </div>
                ) : (
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
                        <div className="overflow-x-auto">
                            {activeTab === 'users' && (
                                <table className="w-full text-left">
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
                                        {filteredUsers.map(user => (
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
                            )}

                            {activeTab === 'jobs' && (
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-950/50 border-b border-gray-800">
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">လုပ်ငန်း / အသုံးပြုသူ</th>
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">အခြေအနေ</th>
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">ရက်စွဲ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {filteredJobs.map(job => (
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
                            )}

                            {activeTab === 'feedback' && (
                                <div className="divide-y divide-gray-800">
                                    {filteredFeedback.map(item => (
                                        <div key={item.id} className="p-6 hover:bg-gray-800/30 transition-colors">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex gap-0.5">
                                                            {[1,2,3,4,5].map(s => (
                                                                <Star key={s} className={`w-4 h-4 ${s <= item.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-700'}`} />
                                                            ))}
                                                        </div>
                                                        <span className="text-sm font-bold text-white">{item.userName}</span>
                                                        <span className="text-xs text-gray-500">{item.userEmail}</span>
                                                    </div>
                                                    <p className="text-gray-300 text-sm leading-relaxed">{item.comment || <span className="italic text-gray-600">မှတ်ချက်မရှိပါ</span>}</p>
                                                    {item.adminReply && (
                                                        <div className="mt-2 p-3 bg-indigo-900/20 border border-indigo-500/20 rounded-xl">
                                                            <p className="text-xs font-bold text-indigo-400 mb-1">Admin ပြန်စာ</p>
                                                            <p className="text-sm text-indigo-100">{item.adminReply}</p>
                                                        </div>
                                                    )}
                                                    <div className="text-[10px] text-gray-600 font-mono">Job ID: {item.jobId || 'N/A'}</div>
                                                    <div className="mt-4 flex flex-col gap-2">
                                                        <textarea 
                                                            placeholder="ပြန်စာရေးရန်..."
                                                            value={replyInputs[item.id] || ''}
                                                            onChange={e => setReplyInputs({ ...replyInputs, [item.id]: e.target.value })}
                                                            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none h-20"
                                                        />
                                                        <button 
                                                            disabled={!replyInputs[item.id]}
                                                            onClick={() => handleReplyFeedback(item.id)}
                                                            className="self-end px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50 disabled:pointer-events-none"
                                                        >
                                                            ပြန်စာပို့ရန်
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="text-xs text-gray-500 text-right">
                                                    {new Date(item.created_at).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredFeedback.length === 0 && (
                                        <div className="p-12 text-center text-gray-500 italic">မှတ်ချက်များ မရှိသေးပါ။</div>
                                    )}
                                </div>
                            )}
                            {activeTab === 'payments' && (
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-950/50 border-b border-gray-800">
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">အသုံးပြုသူ</th>
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">ဖြတ်ပိုင်း</th>
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">အခြေအနေ</th>
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">လုပ်ဆောင်ချက်</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {payments.filter(p => p.userEmail?.toLowerCase().includes(search.toLowerCase())).map(req => (
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
                                                                className="w-16 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
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
                            )}
                            {activeTab === 'settings' && (
                                <div className="p-8 space-y-6 max-w-2xl">
                                    <h2 className="text-xl font-bold text-white">စနစ် ဆက်တင်များ</h2>
                                    <div className="space-y-4">
                                        <button 
                                            onClick={async () => {
                                                try {
                                                    for (const key of Object.keys(settingsValues)) {
                                                        const val = settingsValues[key];
                                                        if (val) {
                                                            await axios.post('/api/settings', { key, value: val });
                                                        }
                                                    }
                                                    alert('ဆက်တင်များ Save လုပ်ပြီးပါပြီ');
                                                    fetchData();
                                                } catch (err: any) {
                                                    alert(err.response?.data?.error || 'ဆက်တင်များ Save မလုပ်နိုင်ပါ');
                                                }
                                            }}
                                            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all"
                                        >
                                            Save ဆက်တင်များ
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
