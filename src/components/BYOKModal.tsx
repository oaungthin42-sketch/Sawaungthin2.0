import React, { useState, useEffect } from 'react';
import { X, CheckCircle, ShieldAlert, Loader2, Key } from 'lucide-react';
import axios from 'axios';

interface BYOKModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BYOKModal: React.FC<BYOKModalProps> = ({ isOpen, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [configured, setConfigured] = useState(false);
    const [masked, setMasked] = useState('');
    const [newKey, setNewKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{valid: boolean, error?: string} | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchStatus();
        }
    }, [isOpen]);

    const fetchStatus = () => {
        setLoading(true);
        axios.get('/api/user/api-key').then(res => {
            setConfigured(res.data.configured);
            setMasked(res.data.masked || '');
        }).finally(() => {
            setLoading(false);
        });
    };

    const handleSave = () => {
        if (!newKey.trim()) return;
        setSaving(true);
        axios.post('/api/user/api-key', { apiKey: newKey.trim() }).then(() => {
            setNewKey('');
            fetchStatus();
        }).finally(() => {
            setSaving(false);
        });
    };

    const handleReplace = () => {
        setConfigured(false);
        setMasked('');
    };

    const handleTest = () => {
        setTesting(true);
        setTestResult(null);
        axios.post('/api/user/api-key/test').then(res => {
            if (res.data.valid) {
                setTestResult({ valid: true });
            } else {
                setTestResult({ valid: false, error: res.data.error || 'Failed to connect to Gemini API.' });
            }
        }).catch(err => {
             setTestResult({ valid: false, error: err.response?.data?.error || err.message });
        }).finally(() => {
            setTesting(false);
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                            <Key className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-semibold text-white">Your Gemini API Key</h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-6 space-y-6">
                    {loading ? (
                        <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-gray-500" /></div>
                    ) : (
                        <>
                            {configured ? (
                                <div className="space-y-4">
                                    <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl flex items-start gap-3">
                                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                                        <div>
                                            <h3 className="text-sm font-medium text-green-400">API Key Configured</h3>
                                            <p className="text-sm text-green-400/80 mt-1 font-mono">{masked}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex gap-3 pt-2">
                                        <button 
                                            onClick={handleTest} 
                                            disabled={testing}
                                            className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test Connection'}
                                        </button>
                                        <button 
                                            onClick={handleReplace}
                                            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 px-4 rounded-xl transition-colors"
                                        >
                                            Replace Key
                                        </button>
                                    </div>

                                    {testResult && (
                                        <div className={`p-4 rounded-xl text-sm ${testResult.valid ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                            {testResult.valid ? 'Connection successful! The API key is working.' : `Connection failed: ${testResult.error}`}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl flex items-start gap-3">
                                        <ShieldAlert className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                                        <div>
                                            <h3 className="text-sm font-medium text-amber-400">API Key Required</h3>
                                            <p className="text-xs text-amber-400/80 mt-1">
                                                You need to provide your own Gemini API key to process videos. Your key is stored securely and only used for your tasks.
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1.5">Gemini API Key</label>
                                        <input 
                                            type="password"
                                            value={newKey}
                                            onChange={(e) => setNewKey(e.target.value)}
                                            placeholder="AIzaSy..."
                                            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                        />
                                    </div>

                                    <button 
                                        onClick={handleSave} 
                                        disabled={!newKey.trim() || saving}
                                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save API Key'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
