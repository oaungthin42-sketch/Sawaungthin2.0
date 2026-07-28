import React, { useState, useEffect } from 'react';
import { Users, Shield, Plus, Minus, UserMinus, UserCheck, Search, Loader2, ArrowLeft, MessageSquare, List, Star } from 'lucide-react';
import axios from 'axios';

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    credits: number;
    created_at: string;
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
    created_at: string;
    jobId: string;
}

interface AdminPageProps {
    onBack: () => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onBack }) => {
    const [activeTab, setActiveTab] = useState<'users' | 'jobs' | 'feedback'>('users');
    const [users, setUsers] = useState<User[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [feedback, setFeedback] = useState<Feedback[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'users') {
                const res = await axios.get('/api/user/admin/users');
                setUsers(res.data);
            } else if (activeTab === 'jobs') {
                const res = await axios.get('/api/user/admin/jobs');
                setJobs(res.data);
            } else if (activeTab === 'feedback') {
                const res = await axios.get('/api/user/admin/feedback');
                setFeedback(res.data);
            }
        } catch (err) {
            console.error('Failed to fetch data', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const handleCredits = async (userId: string, amount: number) => {
        try {
            await axios.post(`/api/user/admin/users/${userId}/credits`, { amount });
            fetchData();
        } catch (err) {
            alert('Failed to update credits');
        }
    };

    const toggleStatus = async (user: User) => {
        try {
            const action = user.status === 'active' ? 'suspend' : 'activate';
            await axios.post(`/api/user/admin/users/${user.id}/${action}`);
            fetchData();
        } catch (err) {
            alert('Failed to update status');
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
        <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-8">
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
                                <h1 className="text-3xl font-bold font-display tracking-tight">Admin Console</h1>
                                <p className="text-gray-500 text-sm font-medium">System management and oversight</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 p-1 bg-gray-900 border border-gray-800 rounded-2xl">
                        <button 
                            onClick={() => setActiveTab('users')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Users className="w-4 h-4" /> Users
                        </button>
                        <button 
                            onClick={() => setActiveTab('jobs')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'jobs' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            <List className="w-4 h-4" /> Jobs
                        </button>
                        <button 
                            onClick={() => setActiveTab('feedback')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === 'feedback' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white'}`}
                        >
                            <MessageSquare className="w-4 h-4" /> Feedback
                        </button>
                    </div>
                </div>

                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-indigo-400 transition-colors" />
                    <input 
                        type="text" 
                        placeholder={`Search ${activeTab}...`} 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded-2xl pl-12 pr-6 py-3 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    />
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
                        <p className="text-gray-500 font-medium">Syncing with server...</p>
                    </div>
                ) : (
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
                        <div className="overflow-x-auto">
                            {activeTab === 'users' && (
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-950/50 border-b border-gray-800">
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">User</th>
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Credits</th>
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {filteredUsers.map(user => (
                                            <tr key={user.id} className="hover:bg-gray-800/30 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-white group-hover:text-indigo-300 transition-colors">{user.name}</span>
                                                        <span className="text-xs text-gray-500 font-mono">{user.email}</span>
                                                        <span className="text-[10px] text-gray-600 mt-1 uppercase font-bold tracking-tighter">Joined {new Date(user.created_at).toLocaleDateString()}</span>
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
                                                        <div className="flex gap-1">
                                                            <button onClick={() => handleCredits(user.id, 5)} className="p-1.5 bg-gray-800 hover:bg-green-600 text-gray-400 hover:text-white rounded-lg transition-all active:scale-90"><Plus className="w-4 h-4" /></button>
                                                            <button onClick={() => handleCredits(user.id, -5)} className="p-1.5 bg-gray-800 hover:bg-red-600 text-gray-400 hover:text-white rounded-lg transition-all active:scale-90"><Minus className="w-4 h-4" /></button>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button onClick={() => toggleStatus(user)} disabled={user.role === 'admin'} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none ${user.status === 'active' ? 'bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white shadow-lg shadow-red-900/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white shadow-lg shadow-green-900/20'}`}>
                                                        {user.status === 'active' ? <><UserMinus className="w-4 h-4" /> SUSPEND</> : <><UserCheck className="w-4 h-4" /> ACTIVATE</>}
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
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Job / User</th>
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {filteredJobs.map(job => (
                                            <tr key={job.id} className="hover:bg-gray-800/30 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-white truncate max-w-xs">{job.originalFilename || 'Untitled Video'}</span>
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
                                                    <p className="text-gray-300 text-sm leading-relaxed">{item.comment || <span className="italic text-gray-600">No comment provided</span>}</p>
                                                    <div className="text-[10px] text-gray-600 font-mono">Job ID: {item.jobId || 'N/A'}</div>
                                                </div>
                                                <div className="text-xs text-gray-500 text-right">
                                                    {new Date(item.created_at).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredFeedback.length === 0 && (
                                        <div className="p-12 text-center text-gray-500 italic">No feedback received yet.</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
