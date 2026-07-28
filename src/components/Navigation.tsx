import React from 'react';
import { 
    LayoutDashboard, 
    Video, 
    CreditCard, 
    MessageSquare, 
    User, 
    LogOut,
    Shield,
    List,
    Settings,
    X
} from 'lucide-react';

interface NavItem {
    id: string;
    label: string;
    icon: React.ElementType;
    adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tool', label: 'Video Tool', icon: Video },
    { id: 'credits', label: 'Credits', icon: CreditCard },
    { id: 'feedback', label: 'Feedback', icon: MessageSquare },
    { id: 'profile', label: 'Profile', icon: User },
    
    // Admin Items
    { id: 'admin-users', label: 'Users', icon: Shield, adminOnly: true },
    { id: 'admin-jobs', label: 'Jobs', icon: List, adminOnly: true },
    { id: 'admin-feedback', label: 'Admin Inbox', icon: MessageSquare, adminOnly: true },
    { id: 'admin-payments', label: 'Payment Requests', icon: CreditCard, adminOnly: true },
    { id: 'admin-settings', label: 'Settings', icon: Settings, adminOnly: true },
];

interface NavigationProps {
    isOpen: boolean;
    onClose: () => void;
    activeView: string;
    onNavigate: (viewId: string) => void;
    user: {
        role: string;
        name: string;
        email: string;
    };
    onLogout: () => void;
    unreadFeedbackCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({ 
    isOpen, 
    onClose, 
    activeView, 
    onNavigate, 
    user, 
    onLogout,
    unreadFeedbackCount = 0
}) => {
    const isAdmin = user?.role === 'admin';

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] lg:hidden animate-in fade-in duration-300"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed top-0 left-0 bottom-0 w-[280px] bg-gray-950 border-r border-gray-900 z-[70] transition-transform duration-300 ease-out lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="h-20 px-6 border-b border-gray-900 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center logo-glow">
                                <img src="/logo-superclick.png" alt="SuperClick" className="w-6 h-6 object-contain" />
                            </div>
                            <span className="font-bold text-lg font-display text-white">SuperClick</span>
                        </div>
                        <button onClick={onClose} className="lg:hidden p-2 text-gray-500 hover:text-white">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Nav Items */}
                    <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8">
                        <div className="space-y-1">
                            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-[0.2em] px-4 mb-2 block">Menu</span>
                            {NAV_ITEMS.filter(item => !item.adminOnly).map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => { onNavigate(item.id); onClose(); }}
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeView === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white hover:bg-gray-900'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <item.icon className="w-5 h-5" />
                                        {item.label}
                                    </div>
                                    {item.id === 'feedback' && unreadFeedbackCount > 0 && (
                                        <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                                            {unreadFeedbackCount}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {isAdmin && (
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-indigo-500/50 uppercase tracking-[0.2em] px-4 mb-2 block text-center bg-indigo-500/5 py-1 rounded-md">Admin Portal</span>
                                {NAV_ITEMS.filter(item => item.adminOnly).map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => { onNavigate(item.id); onClose(); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeView === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-gray-400 hover:text-white hover:bg-gray-900'}`}
                                    >
                                        <item.icon className="w-5 h-5" />
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-gray-900 space-y-4">
                        <div className="flex items-center gap-3 px-2">
                            <div className="w-10 h-10 rounded-full bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold uppercase">
                                {user?.name?.charAt(0) || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-white truncate">{user?.name || 'User'}</p>
                                <p className="text-[10px] text-gray-500 truncate">{user?.email || 'No email'}</p>
                            </div>
                        </div>
                        <button 
                            onClick={onLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-red-400 hover:bg-red-500/10 transition-all"
                        >
                            <LogOut className="w-5 h-5" />
                            Sign Out
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
};
