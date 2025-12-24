
import React, { useState, useEffect, useMemo } from 'react';
import { AppView, Message, User, ChatMessage } from './types.ts';
import { ICONS } from './constants.tsx';
import { analyzeMessageVibe, generateWittyReplies } from './services/geminiService.ts';

const STORAGE_KEY_USER = 'vibecheck_user';
const STORAGE_KEY_MESSAGES = 'vibecheck_messages';
const STORAGE_KEY_SENT_TRACKER = 'vibecheck_sent_ids';

const App: React.FC = () => {
  // --- State with Error Boundaries for LocalStorage ---
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USER);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Failed to parse user from storage", e);
      return null;
    }
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [view, setView] = useState<AppView>('LANDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMessage, setActiveMessage] = useState<Message | null>(null);
  const [detailTab, setDetailTab] = useState<'ANALYSIS' | 'CHAT'>('ANALYSIS');
  
  // UI State
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{ emoji: string; mood: string; insight: string } | null>(null);
  const [aiReplies, setAiReplies] = useState<string[]>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  
  // Sender View State
  const [recipientUsername, setRecipientUsername] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [chatReply, setChatReply] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [mySentMessages, setMySentMessages] = useState<Message[]>([]);

  // --- Syncing ---
  const syncMessages = (user: User | null) => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MESSAGES);
      if (saved) {
        const all: Message[] = JSON.parse(saved);
        const filtered = all.filter(m => m.recipientId.toLowerCase() === user.username.toLowerCase());
        setMessages(filtered);
      }
    } catch (e) {
      console.error("Failed to sync messages", e);
    }
  };

  const syncMySentMessages = (recipient: string) => {
    try {
      const sentIds: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY_SENT_TRACKER) || '[]');
      const allMessages: Message[] = JSON.parse(localStorage.getItem(STORAGE_KEY_MESSAGES) || '[]');
      const filtered = allMessages.filter(m => sentIds.includes(m.id) && m.recipientId.toLowerCase() === recipient.toLowerCase());
      setMySentMessages(filtered);
    } catch (e) {
      console.error("Failed to sync sent messages", e);
    }
  };

  // --- Routing ---
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash || '#/';
      let user = null;
      try {
        const savedUser = localStorage.getItem(STORAGE_KEY_USER);
        user = savedUser ? JSON.parse(savedUser) : null;
      } catch (e) {}

      if (hash.startsWith('#/u/')) {
        const u = hash.replace('#/u/', '').toLowerCase();
        setRecipientUsername(u);
        setView('SENDER_VIEW');
        syncMySentMessages(u);
      } else if (hash.includes('/inbox')) {
        if (user) {
          setView('INBOX');
          syncMessages(user);
        } else {
          window.location.hash = '#/';
        }
      } else {
        setView('LANDING');
      }
    };

    window.addEventListener('hashchange', handleHash);
    handleHash();
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // --- Filtering ---
  const filteredMessages = useMemo(() => {
    return messages
      .filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [messages, searchQuery]);

  // --- Handlers ---
  const handleRegister = (name: string) => {
    const username = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!username) return;
    
    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      username,
      displayName: name.trim(),
      avatar: `https://picsum.photos/seed/${username}/200`
    };
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(newUser));
    setCurrentUser(newUser);
    window.location.hash = '#/inbox';
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !recipientUsername) return;
    setIsSending(true);
    
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY_MESSAGES) || '[]');
      const msgId = Date.now().toString();
      const msg: Message = {
        id: msgId,
        recipientId: recipientUsername.toLowerCase(),
        content: newMessage.trim(),
        timestamp: Date.now(),
        read: false,
        replies: []
      };
      
      all.push(msg);
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(all));
      
      const sentIds = JSON.parse(localStorage.getItem(STORAGE_KEY_SENT_TRACKER) || '[]');
      sentIds.push(msgId);
      localStorage.setItem(STORAGE_KEY_SENT_TRACKER, JSON.stringify(sentIds));
      
      setTimeout(() => {
        setIsSending(false);
        setNewMessage('');
        setJustSent(true);
        syncMySentMessages(recipientUsername);
        setTimeout(() => setJustSent(false), 3000);
      }, 800);
    } catch (e) {
      console.error("Failed to send message", e);
      setIsSending(false);
    }
  };

  const handleSendChatReply = (role: 'owner' | 'anonymous') => {
    if (!chatReply.trim() || !activeMessage) return;

    const reply: ChatMessage = {
      role,
      content: chatReply.trim(),
      timestamp: Date.now()
    };

    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY_MESSAGES) || '[]');
      const updatedAll = all.map((m: Message) => {
        if (m.id === activeMessage.id) {
          return { ...m, replies: [...(m.replies || []), reply] };
        }
        return m;
      });

      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(updatedAll));
      
      const updatedMsg = { ...activeMessage, replies: [...(activeMessage.replies || []), reply] };
      setActiveMessage(updatedMsg);
      setMessages(messages.map(m => m.id === activeMessage.id ? updatedMsg : m));
      setChatReply('');
      
      if (view === 'SENDER_VIEW') {
        syncMySentMessages(recipientUsername);
      }
    } catch (e) {
      console.error("Failed to send chat reply", e);
    }
  };

  const openMessage = async (msg: Message) => {
    setActiveMessage(msg);
    setDetailTab('ANALYSIS');
    setLoadingAi(true);
    setAiAnalysis(null);
    setAiReplies([]);

    try {
      if (!msg.read) {
        const updatedMessages = messages.map(m => m.id === msg.id ? { ...m, read: true } : m);
        setMessages(updatedMessages);
        const all = JSON.parse(localStorage.getItem(STORAGE_KEY_MESSAGES) || '[]');
        const updatedAll = all.map((m: any) => m.id === msg.id ? { ...m, read: true } : m);
        localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(updatedAll));
      }
      
      const [analysis, replies] = await Promise.all([
        analyzeMessageVibe(msg.content),
        generateWittyReplies(msg.content)
      ]);
      setAiAnalysis(analysis);
      setAiReplies(replies);
    } catch (e) {
      console.error("AI Analysis failed", e);
    } finally {
      setLoadingAi(false);
    }
  };

  const deleteMessage = (id: string) => {
    try {
      const updatedMessages = messages.filter(m => m.id !== id);
      setMessages(updatedMessages);
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY_MESSAGES) || '[]');
      const filteredAll = all.filter((m: any) => m.id !== id);
      localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(filteredAll));
      setActiveMessage(null);
    } catch (e) {
      console.error("Failed to delete message", e);
    }
  };

  // --- Sharing System ---
  const getShareUrl = () => {
    const base = window.location.origin + window.location.pathname;
    return `${base}#/u/${currentUser?.username || 'unknown'}`;
  };

  const handleShare = async (platform: string) => {
    const url = getShareUrl();
    const text = `Send me anonymous secrets! 🤫✨`;
    
    if (platform === 'native' && navigator.share) {
      try {
        await navigator.share({ title: 'VibeCheck', text, url });
        return;
      } catch (e) {}
    }

    switch (platform) {
      case 'instagram':
        navigator.clipboard.writeText(url);
        alert("Link copied! Paste it in your Instagram Story Link Sticker. 📸");
        break;
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`, '_blank');
        break;
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
        break;
      default:
        navigator.clipboard.writeText(url);
        alert("Copied link! 🔗");
    }
    setShowShareModal(false);
  };

  const renderLanding = () => (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center animate-in fade-in zoom-in duration-700">
      <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl transform rotate-6 animate-pulse">
        <ICONS.Sparkles className="w-10 h-10 text-black" />
      </div>
      <h1 className="text-7xl font-black mb-6 tracking-tighter italic">
        VIBE<span className="gradient-text">CHECK</span>
      </h1>
      <p className="text-slate-400 text-lg mb-10 max-w-xs font-medium leading-tight">
        The only anonymous box with <span className="text-violet-400">AI Vibe Analysis</span>.
      </p>
      
      <div className="w-full max-w-sm glass p-1.5 rounded-3xl flex items-center border-white/10 group focus-within:border-violet-500/50 transition-all shadow-2xl">
        <span className="pl-4 text-slate-600 font-black text-[10px] uppercase tracking-widest">vibe.me/</span>
        <input 
          type="text" 
          placeholder="your_tag"
          className="bg-transparent border-none focus:ring-0 flex-1 py-4 text-white font-black placeholder:text-slate-800 text-lg"
          onKeyDown={(e) => e.key === 'Enter' && handleRegister(e.currentTarget.value)}
        />
        <button 
          onClick={() => {
            const input = document.querySelector('input') as HTMLInputElement;
            handleRegister(input.value || '');
          }}
          className="bg-white text-black hover:bg-violet-500 hover:text-white active:scale-90 transition-all p-4 rounded-2xl"
        >
          <ICONS.Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  const renderInbox = () => (
    <div className="max-w-xl mx-auto px-4 py-8 animate-in slide-in-from-bottom-8 duration-500">
      <header className="flex items-end justify-between mb-12">
        <div>
          <h2 className="text-5xl font-black tracking-tighter italic">INBOX</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-ping"></span>
            <p className="text-slate-500 text-xs font-black uppercase tracking-[0.2em]">{messages.length} messages</p>
          </div>
        </div>
        <button 
          onClick={() => setShowShareModal(true)}
          className="bg-white text-black hover:scale-105 active:scale-95 transition-all px-6 py-4 rounded-2xl text-[10px] font-black tracking-[0.2em] flex items-center gap-2"
        >
          <ICONS.Share className="w-4 h-4" /> SHARE LINK
        </button>
      </header>

      {messages.length > 0 && (
        <div className="relative mb-8 group">
          <ICONS.Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600" />
          <input 
            type="text"
            placeholder="SEARCH SECRETS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/50 border-none rounded-2xl py-5 pl-12 pr-4 text-xs font-black tracking-widest text-white placeholder:text-slate-700 focus:ring-2 ring-violet-500/20 transition-all"
          />
        </div>
      )}

      <div className="grid gap-4">
        {filteredMessages.map(msg => (
          <div 
            key={msg.id} 
            onClick={() => openMessage(msg)}
            className={`glass p-8 rounded-[2rem] cursor-pointer hover:bg-white/5 active:scale-[0.97] transition-all group relative overflow-hidden ${!msg.read ? 'border-violet-500/30' : 'border-white/5'}`}
          >
            {!msg.read && (
              <div className="absolute top-0 right-0 p-2">
                <span className="flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-500"></span>
                </span>
              </div>
            )}
            
            <p className={`text-xl font-bold leading-snug italic line-clamp-2 ${!msg.read ? 'text-white' : 'text-slate-400'}`}>"{msg.content}"</p>
            <div className="mt-6 flex justify-between items-center opacity-40 group-hover:opacity-100 transition-opacity">
              <span className={`text-[10px] font-black tracking-[0.3em] uppercase ${!msg.read ? 'text-violet-400' : ''}`}>
                {msg.read ? 'Read' : 'Unread Secret'}
              </span>
              <div className="flex items-center gap-3">
                {msg.replies && msg.replies.length > 0 && (
                  <span className="text-[9px] font-black bg-white/10 px-2 py-0.5 rounded-full text-violet-300 border border-violet-500/20">CHAT ACTIVE</span>
                )}
                <span className="text-[9px] font-bold">{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
              </div>
            </div>
          </div>
        ))}
        
        {messages.length === 0 && (
          <div className="py-20 text-center glass rounded-[3rem] border-dashed border-2 border-slate-800">
            <p className="text-slate-600 font-black text-xs uppercase tracking-[0.3em]">No vibes yet...</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderSender = () => (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-10 animate-in fade-in duration-700">
      {justSent ? (
        <div className="text-center animate-in zoom-in duration-500">
          <div className="w-24 h-24 bg-violet-600/20 rounded-full flex items-center justify-center mx-auto mb-8">
            <ICONS.Sparkles className="w-10 h-10 text-violet-500" />
          </div>
          <h2 className="text-4xl font-black mb-4 italic">VIBE SENT!</h2>
          <p className="text-slate-500 font-bold mb-10">@{recipientUsername} will get notified 🚀</p>
          <button 
             onClick={() => setJustSent(false)}
             className="px-8 py-4 bg-white/5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-white/10"
          >
            Send another
          </button>
        </div>
      ) : (
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-10">
            <img src={`https://picsum.photos/seed/${recipientUsername}/200`} className="w-20 h-20 rounded-[2rem] border-4 border-violet-500/20 mb-6 shadow-2xl" alt="PFP" />
            <h2 className="text-2xl font-black italic tracking-tight">@{recipientUsername}</h2>
            <div className="mt-2 bg-white/5 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest text-slate-500 border border-white/5">
              100% Anonymous Box
            </div>
          </div>

          <div className="glass rounded-[2.5rem] p-8 min-h-[200px] shadow-2xl relative group mb-6">
            <div className="absolute top-4 left-8 text-[8px] font-black uppercase tracking-[0.5em] text-violet-500/50">Your secret message</div>
            <textarea 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Ask me anything..."
              className="w-full h-full bg-transparent border-none focus:ring-0 text-2xl font-bold placeholder:text-slate-800 resize-none text-white mt-4"
            ></textarea>
          </div>
          
          <button 
            onClick={handleSendMessage}
            disabled={isSending || !newMessage.trim()}
            className="w-full bg-white text-black py-6 rounded-3xl font-black text-lg shadow-2xl active:scale-95 transition-all disabled:opacity-20"
          >
            {isSending ? 'SENDING...' : 'SEND ANONYMOUSLY'}
          </button>

          {mySentMessages.length > 0 && (
            <div className="mt-16 w-full">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-600 mb-6 text-center">My Sent Vibes</h3>
              <div className="grid gap-3">
                {mySentMessages.map(m => (
                  <div 
                    key={m.id} 
                    onClick={() => { openMessage(m); setDetailTab('CHAT'); }}
                    className="glass p-5 rounded-2xl cursor-pointer hover:bg-white/5 transition-all group flex justify-between items-center"
                  >
                    <div>
                      <p className="text-sm font-bold italic line-clamp-1">"{m.content}"</p>
                      {m.replies && m.replies.length > 0 && (
                        <p className="text-[8px] font-black text-violet-400 uppercase mt-1">
                          {m.replies.length} REPLIES
                        </p>
                      )}
                    </div>
                    <ICONS.Send className="w-4 h-4 text-slate-700 group-hover:text-violet-500" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderChat = (isOwner: boolean) => {
    if (!activeMessage) return null;
    return (
      <div className="flex flex-col h-[400px]">
        <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4 custom-scrollbar">
          <div className="flex flex-col items-start max-w-[85%]">
            <div className="bg-white/5 p-4 rounded-[1.5rem] rounded-tl-none border border-white/5">
              <p className="text-sm font-bold italic">"{activeMessage.content}"</p>
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest text-slate-600 mt-1 ml-2">Anonymous</span>
          </div>

          {activeMessage.replies?.map((reply, i) => (
            <div key={i} className={`flex flex-col ${reply.role === 'owner' ? 'items-end ml-auto' : 'items-start'} max-w-[85%]`}>
              <div className={`p-4 rounded-[1.5rem] border ${reply.role === 'owner' ? 'bg-violet-600/20 border-violet-500/20 rounded-tr-none text-violet-100' : 'bg-white/5 border-white/5 rounded-tl-none'}`}>
                <p className="text-sm font-medium">{reply.content}</p>
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-600 mt-1 mx-2">
                {reply.role === 'owner' ? 'Inbox Owner' : 'Anonymous'}
              </span>
            </div>
          ))}
        </div>
        
        <div className="relative">
          <input 
            type="text"
            value={chatReply}
            onChange={(e) => setChatReply(e.target.value)}
            placeholder="Type an anonymous reply..."
            onKeyDown={(e) => e.key === 'Enter' && handleSendChatReply(isOwner ? 'owner' : 'anonymous')}
            className="w-full bg-slate-900/50 border-none rounded-2xl py-4 pl-6 pr-14 text-sm font-bold text-white placeholder:text-slate-700 focus:ring-2 ring-violet-500/20 transition-all"
          />
          <button 
            onClick={() => handleSendChatReply(isOwner ? 'owner' : 'anonymous')}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-white text-black p-2 rounded-xl hover:bg-violet-500 hover:text-white transition-all"
          >
            <ICONS.Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0f172a] selection:bg-violet-500/50 text-slate-100 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-violet-600/10 blur-[150px] rounded-full"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-pink-600/10 blur-[150px] rounded-full"></div>
      </div>

      {view !== 'SENDER_VIEW' && (
        <nav className="p-6 flex justify-between items-center max-w-6xl mx-auto sticky top-0 z-40 backdrop-blur-md">
          <div className="text-xl font-black italic tracking-tighter cursor-pointer flex items-center gap-2" onClick={() => window.location.hash = '#/'}>
            <div className="w-10 h-10 bg-white text-black rounded-2xl flex items-center justify-center shadow-xl">
               <ICONS.Sparkles className="w-5 h-5" />
            </div>
            <span className="text-2xl">VIBE<span className="text-violet-500">CHECK</span></span>
          </div>
          
          {currentUser && (
            <div className="flex items-center gap-2">
               <button 
                  onClick={() => window.location.hash = '#/inbox'} 
                  className={`p-4 rounded-2xl transition-all relative group ${view === 'INBOX' ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30' : 'bg-white/5 text-slate-500 hover:text-white'}`}
               >
                 <ICONS.Inbox className="w-5 h-5" />
                 {view === 'INBOX' && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-violet-400 rounded-full shadow-[0_0_8px_#8b5cf6]"></span>}
                 {messages.some(m => !m.read) && (
                   <span className="absolute -top-1 -right-1 w-2 h-2 bg-pink-500 rounded-full"></span>
                 )}
               </button>
               <button 
                  onClick={() => { localStorage.removeItem(STORAGE_KEY_USER); window.location.hash = '#/'; }} 
                  className="p-4 rounded-2xl bg-white/5 text-slate-500 hover:text-red-500 transition-all"
               >
                 <ICONS.Trash className="w-5 h-5" />
               </button>
            </div>
          )}
        </nav>
      )}

      <main>{view === 'LANDING' ? renderLanding() : view === 'INBOX' ? renderInbox() : renderSender()}</main>

      {showShareModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setShowShareModal(false)}></div>
          <div className="glass w-full max-w-md rounded-[3rem] p-10 relative animate-in zoom-in duration-300 border-white/10 shadow-[0_0_100px_rgba(139,92,246,0.15)]">
            <h3 className="text-3xl font-black italic mb-2">GET SECRETS</h3>
            <p className="text-slate-500 text-xs font-bold mb-10 uppercase tracking-widest">Share your link to your socials</p>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => handleShare('instagram')} className="flex flex-col items-center gap-3 p-6 rounded-3xl bg-gradient-to-br from-purple-600 to-pink-500 hover:scale-105 transition-transform">
                <ICONS.Instagram className="w-8 h-8" />
                <span className="text-[10px] font-black uppercase">IG Story</span>
              </button>
              <button onClick={() => handleShare('whatsapp')} className="flex flex-col items-center gap-3 p-6 rounded-3xl bg-green-600 hover:scale-105 transition-transform">
                <ICONS.WhatsApp className="w-8 h-8" />
                <span className="text-[10px] font-black uppercase">WhatsApp</span>
              </button>
              <button onClick={() => handleShare('twitter')} className="flex flex-col items-center gap-3 p-6 rounded-3xl bg-slate-900 border border-white/5 hover:scale-105 transition-transform">
                <ICONS.Twitter className="w-8 h-8" />
                <span className="text-[10px] font-black uppercase">X / Twitter</span>
              </button>
              <button onClick={() => handleShare('copy')} className="flex flex-col items-center gap-3 p-6 rounded-3xl bg-white text-black hover:scale-105 transition-transform">
                <ICONS.Share className="w-8 h-8" />
                <span className="text-[10px] font-black uppercase">Copy Link</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeMessage && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={() => setActiveMessage(null)}></div>
          <div className="glass w-full max-w-lg rounded-[3rem] overflow-hidden relative animate-in slide-in-from-bottom duration-300 border-white/10 shadow-2xl flex flex-col max-h-[90vh]">
            
            <div className="p-10 pb-4">
              <div className="flex justify-between items-center mb-6">
                <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
                  <button 
                    onClick={() => setDetailTab('ANALYSIS')}
                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${detailTab === 'ANALYSIS' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
                  >
                    Vibe Analysis
                  </button>
                  <button 
                    onClick={() => setDetailTab('CHAT')}
                    className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all relative ${detailTab === 'CHAT' ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
                  >
                    Anon Chat
                    {activeMessage.replies && activeMessage.replies.length > 0 && detailTab !== 'CHAT' && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-violet-500 rounded-full animate-pulse"></span>
                    )}
                  </button>
                </div>
                <button onClick={() => setActiveMessage(null)} className="p-2 hover:bg-white/10 rounded-full"><ICONS.X className="w-6 h-6" /></button>
              </div>

              {detailTab === 'ANALYSIS' ? (
                <div className="animate-in fade-in duration-300">
                  <p className="text-3xl font-bold italic text-white leading-tight mb-8">"{activeMessage.content}"</p>
                  <div className="space-y-6">
                    <div className="p-6 bg-gradient-to-br from-violet-600/10 to-transparent rounded-[2.5rem] border border-violet-500/10">
                      <div className="flex items-center gap-3 mb-4">
                        <ICONS.Sparkles className="w-4 h-4 text-pink-500" />
                        <span className="text-[9px] font-black uppercase text-pink-400 tracking-widest">AI Vibe Analysis</span>
                      </div>
                      {loadingAi ? (
                        <div className="space-y-3 animate-pulse">
                          <div className="h-4 bg-slate-800 rounded w-full"></div>
                          <div className="h-4 bg-slate-800 rounded w-2/3"></div>
                        </div>
                      ) : aiAnalysis ? (
                        <div className="flex gap-6 items-center">
                          <div className="text-6xl">{aiAnalysis.emoji}</div>
                          <div>
                            <p className="font-black text-2xl uppercase italic leading-none mb-1">{aiAnalysis.mood}</p>
                            <p className="text-sm text-slate-400 font-medium leading-relaxed">{aiAnalysis.insight}</p>
                          </div>
                        </div>
                      ) : <p className="text-xs italic text-slate-600">AI missed the vibe check.</p>}
                    </div>
                    {!loadingAi && aiReplies.length > 0 && (
                      <div className="grid gap-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 px-2 mb-2">Smart Replies</p>
                        {aiReplies.map((reply, i) => (
                          <button 
                            key={i} 
                            onClick={() => { navigator.clipboard.writeText(reply); alert("Witty reply copied!"); }}
                            className="w-full text-left p-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-xs font-bold italic"
                          >
                            "{reply}"
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in duration-300">
                  {renderChat(view === 'INBOX')}
                </div>
              )}
            </div>
            
            <button onClick={() => deleteMessage(activeMessage?.id || '')} className="w-full py-6 text-[10px] font-black uppercase tracking-[0.4em] text-slate-700 hover:text-red-500 transition-colors border-t border-white/5 mt-auto">
              Shred Secret
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
