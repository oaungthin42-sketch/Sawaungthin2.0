import React, { useState, useEffect } from 'react';
import { Download, FileVideo, Clock, Loader2, AlertCircle } from 'lucide-react';
import axios from 'axios';

interface Job {
    jobId: string;
    originalFilename: string;
    completedAt: number;
    videoUrl: string;
    expiresAt: number;
    coverText?: string;
}

export const RecentDownloads: React.FC<{ userId?: string }> = ({ userId }) => {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRecent = async () => {
            if (!userId) {
                setJobs([]);
                setLoading(false);
                return;
            }
            try {
                const storageKey = `superclick_recent_jobs_${userId}`;
                const storedIds = JSON.parse(localStorage.getItem(storageKey) || '[]');
                if (storedIds.length === 0) {
                    setJobs([]);
                    setLoading(false);
                    return;
                }

                const res = await axios.get(`/api/completed-jobs?ids=${storedIds.join(',')}`);
                setJobs(res.data);
                
                // Prune localStorage to keep only valid IDs (e.g. ones returned by the server)
                const validIds = res.data.map((j: Job) => j.jobId);
                localStorage.setItem(storageKey, JSON.stringify(validIds));
                
            } catch (err) {
                console.error('Failed to fetch recent jobs:', err);
                setError('မကြာသေးမီက ဒေါင်းလုဒ်များကို ရယူ၍မရပါ။');
            } finally {
                setLoading(false);
            }
        };

        fetchRecent();
    }, [userId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl flex items-center justify-center gap-3">
                <AlertCircle className="w-6 h-6" />
                <span className="font-bold">{error}</span>
            </div>
        );
    }

    if (jobs.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden p-12 text-center text-gray-500 space-y-4">
                <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileVideo className="w-8 h-8 opacity-20" />
                </div>
                <p className="font-medium text-lg text-white">မကြာသေးမီက ဒေါင်းလုဒ်များ မရှိပါ။</p>
                <p className="text-sm">လုပ်ဆောင်ပြီးသော ဗီဒီယိုများကို ၂၄ နာရီအတွင်း ဤနေရာတွင် ကြည့်နိုင်သည်။</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-white mb-2">မကြာသေးမီက ဒေါင်းလုဒ်များ</h2>
                <p className="text-gray-400">လုပ်ဆောင်ပြီးသော ဗီဒီယိုများကို ပြန်လည်ဒေါင်းလုဒ်လုပ်ပါ။ ဖိုင်များကို ၂၄ နာရီကြာလျှင် ဖျက်ပါမည်။</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {jobs.map(job => {
                    const timeLeft = Math.max(0, job.expiresAt - Date.now());
                    const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
                    const minsLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

                    return (
                        <div key={job.jobId} className="bg-gray-900 border border-gray-800 p-6 rounded-3xl flex flex-col justify-between hover:border-gray-700 transition-colors">
                            <div className="flex items-start gap-4 mb-6">
                                <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl flex-shrink-0">
                                    <FileVideo className="w-6 h-6" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-white font-bold truncate" title={job.originalFilename}>{job.originalFilename}</h3>
                                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        လုပ်ဆောင်ခဲ့သည်- {new Date(job.completedAt).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                            
                            {job.coverText && (
                                <div className="mb-4 bg-gray-950 border border-gray-800 rounded-xl p-3 flex items-center justify-between gap-2 text-xs">
                                    <p className="text-gray-400 truncate flex-1">{job.coverText}</p>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(job.coverText || '')}
                                        className="shrink-0 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded cursor-pointer"
                                    >
                                        Copy
                                    </button>
                                </div>
                            )}
                            
                            <div className="flex items-center justify-between mt-auto">
                                <div className="text-xs font-bold text-amber-500/80 bg-amber-500/10 px-2 py-1 rounded">
                                    သက်တမ်းကုန်ဆုံးရန် {hoursLeft}h {minsLeft}m
                                </div>
                                <a 
                                    href={job.videoUrl} 
                                    download 
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all"
                                >
                                    <Download className="w-4 h-4" /> ဒေါင်းလုဒ်လုပ်ရန်
                                </a>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
