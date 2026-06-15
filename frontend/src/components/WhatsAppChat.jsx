import { useState, useEffect, useRef } from 'preact/hooks';
import { useStore } from '../stores/store';
import Icon from './Icons';

const MediaMessage = ({ mediaId, type }) => {
    const { fetchMediaUrl } = useStore();
    const [mediaUrl, setMediaUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!mediaId) {
            setLoading(false);
            setError(true);
            return;
        }
        let isMounted = true;
        fetchMediaUrl(mediaId)
            .then(url => {
                if (isMounted) {
                    setMediaUrl(url);
                    setLoading(false);
                }
            })
            .catch(err => {
                console.error('Failed to load media:', err);
                if (isMounted) {
                    setError(true);
                    setLoading(false);
                }
            });
        return () => { isMounted = false; };
    }, [mediaId, fetchMediaUrl]);

    if (loading) return <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5, fontSize: '12px' }}>Loading {type}...</div>;
    if (error) return <div style={{ fontSize: '12px', opacity: 0.6, marginBottom: '4px' }}>{type === 'image' ? '📷' : '🎥'} {type} (failed to load)</div>;

    if (type === 'image') {
        return (
            <a href={mediaUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: '4px' }}>
                <img src={mediaUrl} alt="WhatsApp Image" style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '6px', objectFit: 'contain' }} />
            </a>
        );
    }

    if (type === 'audio') {
        return (
            <div style={{ padding: '6px 0', minWidth: '220px' }}>
                <audio controls src={mediaUrl} style={{ width: '100%' }} />
            </div>
        );
    }

    if (type === 'video') {
        return (
            <div style={{ padding: '6px 0' }}>
                <video controls src={mediaUrl} style={{ maxWidth: '100%', maxHeight: '250px', borderRadius: '6px' }} />
            </div>
        );
    }
    
    return <div style={{ fontSize: '12px', opacity: 0.6, marginBottom: '4px' }}>📎 {type}</div>;
};

export default function WhatsAppChat() {
    const {
        conversations, totalUnread, activeConversation, chatMessages,
        fetchConversations, fetchChatMessages, sendChatReply, sendChatTemplate, sendChatMedia,
        markConversationRead, archiveConversation, startNewConversation,
        showToast, fetchWhatsAppTemplates, whatsappTemplates,
        contacts, fetchContacts,
    } = useStore();

    const [search, setSearch] = useState('');
    const [selectedConvId, setSelectedConvId] = useState(null);
    const [messageText, setMessageText] = useState('');
    const [sending, setSending] = useState(false);
    
    // File attachment states
    const [selectedFile, setSelectedFile] = useState(null);
    const [filePreviewUrl, setFilePreviewUrl] = useState(null);
    const fileInputRef = useRef(null);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [templateParams, setTemplateParams] = useState(['', '', '']);
    const messagesEndRef = useRef(null);
    const pollRef = useRef(null);
    const [mobileShowChat, setMobileShowChat] = useState(false);

    // Voice Recording states
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timerRef = useRef(null);

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunksRef.current = [];
            
            const options = { mimeType: 'audio/webm' };
            let mediaRecorder;
            try {
                mediaRecorder = new MediaRecorder(stream, options);
            } catch (e) {
                // Fallback for Safari/iOS
                mediaRecorder = new MediaRecorder(stream);
            }
            
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.start(250);
            setIsRecording(true);
            setRecordingTime(0);

            timerRef.current = setInterval(() => {
                setRecordingTime(t => t + 1);
            }, 1000);
        } catch (err) {
            console.error('Failed to start recording:', err);
            showToast('Microphone access is required to record voice notes.', 'error');
        }
    };

    const cancelRecording = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
        setIsRecording(false);
        setRecordingTime(0);
        audioChunksRef.current = [];
    };

    const stopAndSendRecording = () => {
        if (!selectedConvId) return;
        
        if (timerRef.current) clearInterval(timerRef.current);
        
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
            return;
        }

        mediaRecorderRef.current.onstop = async () => {
            try {
                const mimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
                const file = new File([audioBlob], `voice_note_${Date.now()}.${extension}`, { type: mimeType });
                
                setSending(true);
                await sendChatMedia(selectedConvId, file, '');
                showToast('Voice note sent!');
            } catch (err) {
                showToast(err.message || 'Failed to send voice note', 'error');
            } finally {
                setSending(false);
                setIsRecording(false);
                setRecordingTime(0);
                audioChunksRef.current = [];
            }
        };

        mediaRecorderRef.current.stop();
        if (mediaRecorderRef.current.stream) {
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
    };

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // New Chat modal state
    const [showNewChat, setShowNewChat] = useState(false);
    const [newChatPhone, setNewChatPhone] = useState('');
    const [newChatName, setNewChatName] = useState('');
    const [newChatTemplate, setNewChatTemplate] = useState('');
    const [newChatParams, setNewChatParams] = useState(['', '', '']);
    const [newChatSearch, setNewChatSearch] = useState('');
    const [newChatSending, setNewChatSending] = useState(false);
    const [newChatStep, setNewChatStep] = useState(1);

    // Keep refs in sync so polling always uses latest values
    const selectedConvIdRef = useRef(selectedConvId);
    const searchRef = useRef(search);
    useEffect(() => { selectedConvIdRef.current = selectedConvId; }, [selectedConvId]);
    useEffect(() => { searchRef.current = search; }, [search]);

    // Initial load
    useEffect(() => {
        fetchConversations();
        fetchWhatsAppTemplates();
        fetchContacts();
    }, []);

    // Polling — restart whenever selectedConvId changes so we immediately poll the right conversation
    useEffect(() => {
        pollRef.current = setInterval(() => {
            fetchConversations(searchRef.current);
            if (selectedConvIdRef.current) fetchChatMessages(selectedConvIdRef.current);
        }, 8000);

        return () => clearInterval(pollRef.current);
    }, [selectedConvId]);

    useEffect(() => {
        const timer = setTimeout(() => fetchConversations(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const openConversation = async (convId) => {
        setSelectedConvId(convId);
        setMobileShowChat(true);
        await fetchChatMessages(convId);
        await markConversationRead(convId);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showToast('File must be less than 5MB', 'error');
            return;
        }
        setSelectedFile(file);
        setFilePreviewUrl(URL.createObjectURL(file));
    };

    const clearFile = () => {
        setSelectedFile(null);
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        setFilePreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSend = async () => {
        if ((!messageText.trim() && !selectedFile) || !selectedConvId) return;
        setSending(true);
        try {
            if (selectedFile) {
                await sendChatMedia(selectedConvId, selectedFile, messageText.trim());
                clearFile();
            } else {
                await sendChatReply(selectedConvId, messageText.trim());
            }
            setMessageText('');
        } catch (err) {
            if (err.message?.includes('24-hour') || err.message?.includes('window')) {
                showToast('24-hour window expired. Use a template to re-engage.', 'info');
                setShowTemplatePicker(true);
            } else {
                showToast(err.message, 'error');
            }
        }
        setSending(false);
    };

    const handleSendTemplate = async () => {
        if (!selectedTemplate || !selectedConvId) return;
        setSending(true);
        try {
            await sendChatTemplate(selectedConvId, selectedTemplate, templateParams.filter(Boolean));
            setShowTemplatePicker(false);
            setSelectedTemplate('');
            setTemplateParams(['', '', '']);
            showToast('Template sent');
        } catch (err) {
            showToast(err.message, 'error');
        }
        setSending(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Backend stores timestamps in UTC — append 'Z' so JS Date parses as UTC
    // toLocaleTimeString then auto-converts to user's local timezone
    const parseUTC = (dateStr) => new Date(dateStr?.replace(' ', 'T') + 'Z');

    const formatTime = (dateStr) => {
        if (!dateStr) return '';
        const d = parseUTC(dateStr);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        if (isToday) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };

    const formatFullTime = (dateStr) => {
        if (!dateStr) return '';
        return parseUTC(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const statusIcon = (status) => {
        if (status === 'sent') return '\u2713';
        if (status === 'delivered') return '\u2713\u2713';
        if (status === 'read') return '\u2713\u2713';
        if (status === 'failed') return '\u2717';
        return '\u23F3';
    };

    const approvedTemplates = (whatsappTemplates || []).filter(t => t.status === 'APPROVED');
    const conv = activeConversation;
    const isWindowOpen = conv?.is_window_open;
    const windowMinutes = conv?.window_remaining_minutes || 0;

    // Parse template body JSON for rich display
    const parseTemplateBody = (body) => {
        try {
            const data = JSON.parse(body);
            if (data._type === 'template_rich') return data;
        } catch {}
        return null;
    };

    // Rich template card renderer
    const TemplateCard = ({ data, time, status, direction, errorMessage }) => (
        <div style={{
            display: 'flex',
            justifyContent: direction === 'outbound' ? 'flex-end' : 'flex-start',
            marginBottom: '2px',
        }}>
            <div style={{
                maxWidth: '70%', borderRadius: '8px', overflow: 'hidden',
                background: direction === 'outbound' ? '#dcf8c6' : '#fff',
                boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                ...(status === 'failed' && { border: '1px solid #ef4444', background: '#fef2f2' }),
            }}>
                {/* Header */}
                {data.header && data.header.format === 'IMAGE' && data.header.url && (
                    <img src={data.header.url} alt="Template header"
                        style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block' }}
                        onError={e => { e.target.style.display = 'none'; }}
                    />
                )}
                {data.header && data.header.format === 'VIDEO' && (
                    <div style={{
                        background: '#000', height: '120px', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '28px',
                    }}>
                        {'\uD83C\uDFA5'}
                    </div>
                )}
                {data.header && data.header.format === 'DOCUMENT' && (
                    <div style={{
                        background: '#f0f2f5', padding: '12px', display: 'flex',
                        alignItems: 'center', gap: '8px', fontSize: '13px', color: '#555',
                    }}>
                        {'\uD83D\uDCC4'} Document
                    </div>
                )}
                {data.header && data.header.format === 'TEXT' && data.header.text && (
                    <div style={{ padding: '8px 12px 0', fontWeight: 700, fontSize: '14px' }}>
                        {data.header.text}
                    </div>
                )}

                {/* Body */}
                <div style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '4px', fontStyle: 'italic' }}>Template</div>
                    <div style={{ fontSize: '14px', lineHeight: '1.4', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                        {data.body}
                    </div>

                    {/* Footer */}
                    {data.footer && (
                        <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '6px' }}>{data.footer}</div>
                    )}

                    {/* Timestamp + status */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                        <span style={{ fontSize: '10px', opacity: 0.4 }}>{formatFullTime(time)}</span>
                        {direction === 'outbound' && (
                            <span style={{
                                fontSize: '12px',
                                color: status === 'read' ? '#53bdeb' : status === 'failed' ? '#ef4444' : '#999',
                            }}>
                                {statusIcon(status)}
                            </span>
                        )}
                    </div>
                    {status === 'failed' && errorMessage && (
                        <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>{errorMessage}</div>
                    )}
                </div>

                {/* Buttons */}
                {data.buttons && data.buttons.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                        {data.buttons.map((btn, idx) => (
                            <div key={idx} style={{
                                padding: '8px 12px', textAlign: 'center', fontSize: '13px',
                                fontWeight: 500,
                                color: btn.type === 'PHONE_NUMBER' ? '#25D366' : btn.type === 'URL' ? '#00a5f4' : '#00a5f4',
                                borderTop: idx > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                            }}>
                                {btn.type === 'PHONE_NUMBER' && '\u260E\uFE0F'}
                                {btn.type === 'URL' && '\uD83D\uDD17'}
                                {btn.text}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    const filteredNewChatContacts = (contacts || []).filter(c => {
        if (!newChatSearch) return true;
        const q = newChatSearch.toLowerCase();
        return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
    });

    const openNewChatModal = () => {
        setShowNewChat(true);
        setNewChatStep(1);
        setNewChatPhone('');
        setNewChatName('');
        setNewChatTemplate('');
        setNewChatParams(['', '', '']);
        setNewChatSearch('');
        fetchContacts();
    };

    const selectContact = (contact) => {
        setNewChatPhone(contact.phone);
        setNewChatName(contact.name);
        setNewChatStep(2);
    };

    const handleStartNewChat = async () => {
        if (!newChatPhone.trim() || !newChatTemplate) return;
        setNewChatSending(true);
        try {
            const result = await startNewConversation(
                newChatPhone.trim(), newChatName.trim(), newChatTemplate,
                newChatParams.filter(Boolean)
            );
            setShowNewChat(false);
            showToast('Template sent! Conversation started.');
            if (result?.conversationId) {
                await openConversation(result.conversationId);
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
        setNewChatSending(false);
    };

    return (
        <div className="page-container" style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
            <div className="page-header" style={{ flexShrink: 0 }}>
                <div>
                    <h1 className="page-title">Chat Inbox</h1>
                    <p className="page-subtitle">
                        {totalUnread > 0 ? `${totalUnread} unread conversation${totalUnread !== 1 ? 's' : ''}` : 'Reply to WhatsApp conversations'}
                    </p>
                </div>
            </div>

            <div className="chat-layout" style={{ flex: 1, display: 'flex', gap: '0', border: '1px solid var(--border, #e2e8f0)', borderRadius: '12px', overflow: 'hidden', minHeight: 0 }}>
                {/* Left: Conversation List */}
                <div className={`chat-sidebar${mobileShowChat ? ' hidden-mobile' : ''}`} style={{ width: '340px', flexShrink: 0, borderRight: '1px solid var(--border, #e2e8f0)', display: 'flex', flexDirection: 'column', background: 'var(--surface, #fff)' }}>
                    {/* Search + New Chat Button */}
                    <div style={{ padding: '12px', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div className="search-bar" style={{ margin: 0, flex: 1 }}>
                            <Icon name="search" size={16} />
                            <input type="text" value={search} onInput={e => setSearch(e.target.value)}
                                placeholder="Search chats..." className="search-input" style={{ fontSize: '13px' }} />
                        </div>
                        <button
                            onClick={openNewChatModal}
                            title="New Chat"
                            style={{
                                width: '38px', height: '38px', borderRadius: '50%',
                                background: '#25d366', color: '#fff', border: 'none',
                                cursor: 'pointer', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', flexShrink: 0,
                                boxShadow: '0 2px 6px rgba(37,211,102,0.3)',
                                transition: 'transform 0.15s, box-shadow 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,211,102,0.4)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(37,211,102,0.3)'; }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                                <line x1="12" y1="8" x2="12" y2="16"/>
                                <line x1="8" y1="12" x2="16" y2="12"/>
                            </svg>
                        </button>
                    </div>

                    {/* Conversation List */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {conversations.length === 0 ? (
                            <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: '13px' }}>
                                <div style={{ opacity: 0.3, marginBottom: '16px' }}>
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                                    </svg>
                                </div>
                                <div style={{ opacity: 0.5, marginBottom: '12px' }}>No conversations yet</div>
                                <button className="btn btn--success" style={{ fontSize: '13px', padding: '8px 16px' }} onClick={openNewChatModal}>
                                    + Start New Chat
                                </button>
                            </div>
                        ) : conversations.map(c => (
                            <div
                                key={c.id}
                                onClick={() => openConversation(c.id)}
                                style={{
                                    padding: '12px 16px', cursor: 'pointer',
                                    background: selectedConvId === c.id ? 'var(--primary-light, #eef2ff)' : 'transparent',
                                    borderBottom: '1px solid var(--border, #f1f5f9)',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { if (selectedConvId !== c.id) e.currentTarget.style.background = '#f8fafc'; }}
                                onMouseLeave={e => { if (selectedConvId !== c.id) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontWeight: c.unread_count > 0 ? 700 : 500, fontSize: '14px' }}>
                                        {c.display_name}
                                    </span>
                                    <span style={{ fontSize: '11px', opacity: 0.5 }}>{formatTime(c.last_message_at)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{
                                        fontSize: '12px', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap', flex: 1, marginRight: '8px',
                                        fontWeight: c.unread_count > 0 ? 600 : 400,
                                    }}>
                                        {c.last_message_text || 'No messages'}
                                    </span>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                        {c.is_window_open && (
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} title="24h window open" />
                                        )}
                                        {c.unread_count > 0 && (
                                            <span style={{
                                                minWidth: '18px', height: '18px', borderRadius: '9px',
                                                background: '#25d366', color: '#fff', fontSize: '11px', fontWeight: 700,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                                            }}>
                                                {c.unread_count}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Chat Area */}
                <div className={`chat-area${!mobileShowChat ? ' hidden-mobile' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f0f2f5' }}>
                    {!selectedConvId ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', opacity: 0.4 }}>
                            <Icon name="chat" size={64} />
                            <p style={{ marginTop: '12px', fontSize: '16px' }}>Select a conversation to start chatting</p>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div style={{
                                padding: '12px 20px', background: '#fff',
                                borderBottom: '1px solid var(--border, #e2e8f0)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <button className="chat-back-btn btn-icon" onClick={() => setMobileShowChat(false)}
                                        style={{ display: 'none' }} title="Back">
                                        <Icon name="arrow-left" size={20} />
                                    </button>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '15px' }}>{conv?.contact_name || conv?.phone}</div>
                                        <div style={{ fontSize: '12px', opacity: 0.5, fontFamily: 'monospace' }}>{conv?.phone}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {isWindowOpen ? (
                                        <span style={{
                                            fontSize: '11px', padding: '4px 10px', borderRadius: '12px',
                                            background: '#dcfce7', color: '#16a34a', fontWeight: 600,
                                        }}>
                                            {'\uD83D\uDFE2'} Window open ({windowMinutes > 60 ? `${Math.floor(windowMinutes / 60)}h ${windowMinutes % 60}m` : `${windowMinutes}m`})
                                        </span>
                                    ) : (
                                        <span style={{
                                            fontSize: '11px', padding: '4px 10px', borderRadius: '12px',
                                            background: '#fef2f2', color: '#dc2626', fontWeight: 600,
                                        }}>
                                            {'\uD83D\uDD34'} Window closed
                                        </span>
                                    )}
                                    <button className="btn-icon" onClick={() => archiveConversation(selectedConvId)} title="Archive">
                                        <Icon name="archive" size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Messages */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {chatMessages.map(msg => {
                                    // Check if this is a rich template message
                                    if (msg.message_type === 'template') {
                                        const tplData = parseTemplateBody(msg.body);
                                        if (tplData) {
                                            return (
                                                <TemplateCard
                                                    key={msg.id}
                                                    data={tplData}
                                                    time={msg.created_at}
                                                    status={msg.status}
                                                    direction={msg.direction}
                                                    errorMessage={msg.error_message}
                                                />
                                            );
                                        }
                                    }

                                    // Default rendering for text, media, and old-format template messages
                                    return (
                                    <div key={msg.id} style={{
                                        display: 'flex',
                                        justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start',
                                        marginBottom: '2px',
                                    }}>
                                        <div style={{
                                            maxWidth: '70%', padding: '8px 12px', borderRadius: '8px',
                                            background: msg.direction === 'outbound' ? '#dcf8c6' : '#fff',
                                            boxShadow: '0 1px 1px rgba(0,0,0,0.1)',
                                            ...(msg.status === 'failed' && { border: '1px solid #ef4444', background: '#fef2f2' }),
                                        }}>
                                            {msg.message_type === 'template' && (
                                                <div style={{ fontSize: '10px', opacity: 0.5, marginBottom: '4px', fontStyle: 'italic' }}>Template</div>
                                            )}
                                            {['image', 'video', 'document', 'audio'].includes(msg.message_type) && msg.media_id ? (
                                                <MediaMessage mediaId={msg.media_id} type={msg.message_type} />
                                            ) : (
                                                <>
                                                    {msg.message_type === 'image' && (
                                                        <div style={{ fontSize: '12px', opacity: 0.6, marginBottom: '4px' }}>{'\uD83D\uDCF7'} Image</div>
                                                    )}
                                                    {msg.message_type === 'video' && (
                                                        <div style={{ fontSize: '12px', opacity: 0.6, marginBottom: '4px' }}>{'\uD83C\uDFA5'} Video</div>
                                                    )}
                                                    {msg.message_type === 'document' && (
                                                        <div style={{ fontSize: '12px', opacity: 0.6, marginBottom: '4px' }}>{'\uD83D\uDCC4'} Document</div>
                                                    )}
                                                    {msg.message_type === 'audio' && (
                                                        <div style={{ fontSize: '12px', opacity: 0.6, marginBottom: '4px' }}>{'\uD83C\uDFB5'} Audio</div>
                                                    )}
                                                </>
                                            )}
                                            {msg.message_type === 'order' && msg.media_id && (
                                                <img 
                                                    src={msg.media_id} 
                                                    alt="Product Thumbnail" 
                                                    style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '6px', marginBottom: '8px', border: '1px solid rgba(0,0,0,0.1)' }} 
                                                    onError={e => { e.target.style.display = 'none'; }} 
                                                />
                                            )}
                                            <div style={{ fontSize: '14px', lineHeight: '1.4', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                                {msg.body || ''}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                                <span style={{ fontSize: '10px', opacity: 0.4 }}>{formatFullTime(msg.created_at)}</span>
                                                {msg.direction === 'outbound' && (
                                                    <span style={{
                                                        fontSize: '12px',
                                                        color: msg.status === 'read' ? '#53bdeb' : msg.status === 'failed' ? '#ef4444' : '#999',
                                                    }}>
                                                        {statusIcon(msg.status)}
                                                    </span>
                                                )}
                                            </div>
                                            {msg.status === 'failed' && msg.error_message && (
                                                <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>{msg.error_message}</div>
                                            )}
                                        </div>
                                    </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Window expired banner */}
                            {!isWindowOpen && (
                                <div style={{
                                    padding: '8px 16px', background: '#fef3c7', borderTop: '1px solid #fcd34d',
                                    fontSize: '13px', color: '#92400e', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <span>{'\u26A0\uFE0F'} 24-hour window expired. You can only send templates.</span>
                                    <button className="btn btn--outline" style={{ fontSize: '12px', padding: '4px 10px' }}
                                        onClick={() => setShowTemplatePicker(true)}>
                                        Send Template
                                    </button>
                                </div>
                            )}

                            {/* Input Area */}
                            {filePreviewUrl && (
                                <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid var(--border, #e2e8f0)', position: 'relative' }}>
                                    <div style={{ display: 'inline-block', position: 'relative' }}>
                                        <img src={filePreviewUrl} alt="Preview" style={{ maxHeight: '100px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
                                        <button onClick={clearFile} style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Icon name="close" size={14} />
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div style={{
                                padding: '12px 16px', background: '#fff',
                                borderTop: '1px solid var(--border, #e2e8f0)',
                                display: 'flex', gap: '8px', alignItems: 'center',
                            }}>
                                {isRecording ? (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '12px', flex: 1,
                                        background: '#f8fafc', padding: '6px 16px', borderRadius: '20px',
                                        border: '1px solid #ef4444'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                                            <span className="blink-dot" style={{
                                                width: '10px', height: '10px', borderRadius: '50%',
                                                background: '#ef4444', display: 'inline-block'
                                            }} />
                                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444' }}>Recording Voice Note...</span>
                                            <span style={{ fontSize: '14px', fontFamily: 'monospace', marginLeft: 'auto', color: 'var(--text-secondary)' }}>
                                                {formatDuration(recordingTime)}
                                            </span>
                                        </div>
                                        <button onClick={cancelRecording} className="btn-icon" style={{ color: 'var(--text-secondary)', padding: '6px' }} title="Cancel">
                                            <Icon name="x" size={20} />
                                        </button>
                                        <button onClick={stopAndSendRecording} style={{
                                            width: '32px', height: '32px', borderRadius: '50%',
                                            background: '#25d366', color: '#fff', border: 'none', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }} title="Send Voice Note">
                                            <Icon name="check" size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={!isWindowOpen || sending}
                                            style={{
                                                width: '42px', height: '42px', borderRadius: '50%',
                                                background: 'transparent', color: '#64748b', border: 'none', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0, transition: 'color 0.2s',
                                            }}
                                        >
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                                            </svg>
                                        </button>
                                        <input 
                                            type="file" 
                                            accept="image/*,application/pdf" 
                                            ref={fileInputRef} 
                                            onChange={handleFileChange} 
                                            style={{ display: 'none' }} 
                                        />
                                        <textarea
                                            value={messageText}
                                            onInput={e => setMessageText(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            placeholder={isWindowOpen ? (selectedFile ? "Add a caption..." : "Type a message...") : "Window expired \u2014 use template"}
                                            disabled={!isWindowOpen || sending}
                                            style={{
                                                flex: 1, resize: 'none', border: '1px solid var(--border, #e2e8f0)',
                                                borderRadius: '20px', padding: '10px 16px', fontSize: '14px',
                                                maxHeight: '100px', minHeight: '42px', outline: 'none',
                                                fontFamily: 'inherit', lineHeight: '1.4',
                                                background: isWindowOpen ? '#fff' : '#f5f5f5',
                                            }}
                                            rows={1}
                                        />
                                        
                                        {(!messageText.trim() && !selectedFile) ? (
                                            <button
                                                onClick={startRecording}
                                                disabled={!isWindowOpen || sending}
                                                style={{
                                                    width: '42px', height: '42px', borderRadius: '50%',
                                                    background: isWindowOpen ? '#64748b' : '#ccc',
                                                    color: '#fff', border: 'none', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    flexShrink: 0, transition: 'background 0.2s',
                                                }}
                                                title="Record Voice Note"
                                            >
                                                <Icon name="mic" size={20} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleSend}
                                                disabled={sending || !isWindowOpen}
                                                style={{
                                                    width: '42px', height: '42px', borderRadius: '50%',
                                                    background: isWindowOpen ? '#25d366' : '#ccc',
                                                    color: '#fff', border: 'none', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    flexShrink: 0, transition: 'background 0.2s',
                                                }}
                                                title="Send Message"
                                            >
                                                <Icon name="send" size={20} />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Template Picker Modal */}
            {showTemplatePicker && (
                <div className="modal-backdrop" onClick={() => setShowTemplatePicker(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h2>Send Template Message</h2>
                            <button className="btn-icon" onClick={() => setShowTemplatePicker(false)}><Icon name="close" size={20} /></button>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Select Template</label>
                            <select className="form-input" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                                <option value="">Choose a template</option>
                                {approvedTemplates.map(t => (
                                    <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
                                ))}
                            </select>
                        </div>
                        {selectedTemplate && (
                            <div className="form-group">
                                <label className="form-label">Template Variables (if any)</label>
                                {[0, 1, 2].map(i => (
                                    <input key={i} className="form-input" value={templateParams[i] || ''}
                                        onInput={e => { const p = [...templateParams]; p[i] = e.target.value; setTemplateParams(p); }}
                                        placeholder={`Variable {{${i + 1}}}`} style={{ marginBottom: '8px' }} />
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button className="btn btn--outline" onClick={() => setShowTemplatePicker(false)}>Cancel</button>
                            <button className="btn btn--success" onClick={handleSendTemplate} disabled={!selectedTemplate || sending}>
                                {sending ? 'Sending...' : 'Send Template'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* New Chat Modal */}
            {showNewChat && (
                <div className="modal-backdrop" onClick={() => setShowNewChat(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header">
                            <h2>{newChatStep === 1 ? 'Start New Chat' : 'Select Template'}</h2>
                            <button className="btn-icon" onClick={() => setShowNewChat(false)}><Icon name="close" size={20} /></button>
                        </div>

                        {newChatStep === 1 ? (
                            <>
                                {/* Direct Phone Entry */}
                                <div style={{ padding: '0 0 12px', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                                    <div className="form-group" style={{ marginBottom: '8px' }}>
                                        <label className="form-label">Enter Phone Number</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                className="form-input"
                                                value={newChatPhone}
                                                onInput={e => setNewChatPhone(e.target.value)}
                                                placeholder="e.g. 919876543210"
                                                style={{ flex: 1 }}
                                            />
                                            <button
                                                className="btn btn--primary"
                                                disabled={!newChatPhone.trim()}
                                                onClick={() => setNewChatStep(2)}
                                                style={{ whiteSpace: 'nowrap' }}
                                            >
                                                Next {'\u2192'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <input
                                            className="form-input"
                                            value={newChatName}
                                            onInput={e => setNewChatName(e.target.value)}
                                            placeholder="Contact name (optional)"
                                        />
                                    </div>
                                </div>

                                {/* Or Select from Contacts */}
                                <div style={{ padding: '12px 0 8px' }}>
                                    <label className="form-label" style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6 }}>
                                        Or select from contacts
                                    </label>
                                    <input
                                        className="form-input"
                                        value={newChatSearch}
                                        onInput={e => setNewChatSearch(e.target.value)}
                                        placeholder="Search contacts..."
                                        style={{ marginBottom: '8px' }}
                                    />
                                </div>
                                <div style={{ flex: 1, overflow: 'auto', maxHeight: '300px', border: '1px solid var(--border, #e2e8f0)', borderRadius: '8px' }}>
                                    {filteredNewChatContacts.length === 0 ? (
                                        <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5, fontSize: '13px' }}>No contacts found</div>
                                    ) : filteredNewChatContacts.slice(0, 50).map(c => (
                                        <div
                                            key={c.id}
                                            onClick={() => c.phone && selectContact(c)}
                                            style={{
                                                padding: '10px 14px', cursor: c.phone ? 'pointer' : 'default',
                                                borderBottom: '1px solid #f1f5f9',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                opacity: c.phone ? 1 : 0.4,
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => { if (c.phone) e.currentTarget.style.background = '#f0fdf4'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 500, fontSize: '14px' }}>{c.name}</div>
                                                <div style={{ fontSize: '12px', opacity: 0.5, fontFamily: 'monospace' }}>{c.phone || 'No phone'}</div>
                                            </div>
                                            {c.phone && (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2">
                                                    <path d="M5 12h14M12 5l7 7-7 7"/>
                                                </svg>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Step 2: Template Selection */}
                                <div style={{
                                    padding: '8px 12px', background: '#f0fdf4', borderRadius: '8px', marginBottom: '12px',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{newChatName || newChatPhone}</div>
                                        <div style={{ fontSize: '12px', opacity: 0.6, fontFamily: 'monospace' }}>{newChatPhone}</div>
                                    </div>
                                    <button className="btn btn--outline" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={() => setNewChatStep(1)}>
                                        {'\u2190'} Change
                                    </button>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Select Template</label>
                                    <select className="form-input" value={newChatTemplate} onChange={e => setNewChatTemplate(e.target.value)}>
                                        <option value="">Choose an approved template</option>
                                        {approvedTemplates.map(t => (
                                            <option key={t.name} value={t.name}>{t.name} ({t.language})</option>
                                        ))}
                                    </select>
                                </div>

                                {newChatTemplate && (
                                    <div className="form-group">
                                        <label className="form-label">Template Variables (if any)</label>
                                        {[0, 1, 2].map(i => (
                                            <input key={i} className="form-input" value={newChatParams[i] || ''}
                                                onInput={e => { const p = [...newChatParams]; p[i] = e.target.value; setNewChatParams(p); }}
                                                placeholder={`Variable {{${i + 1}}}`} style={{ marginBottom: '8px' }} />
                                        ))}
                                    </div>
                                )}

                                {/* WhatsApp Preview */}
                                {newChatTemplate && (() => {
                                    const tpl = approvedTemplates.find(t => t.name === newChatTemplate);
                                    const bodyComp = tpl?.components?.find(c => c.type === 'BODY');
                                    const bodyText = bodyComp?.text?.replace(/\{\{(\d+)\}\}/g, (_, idx) => newChatParams[parseInt(idx) - 1] || `{{${idx}}}`) || '';
                                    const buttonsComp = tpl?.components?.find(c => c.type === 'BUTTONS');
                                    return (
                                        <div style={{
                                            background: '#e5ddd5', borderRadius: '10px', padding: '14px 12px',
                                            marginBottom: '8px',
                                        }}>
                                            <div style={{
                                                background: '#fff', borderRadius: '0 8px 8px 8px',
                                                padding: '8px 10px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                                maxWidth: '260px',
                                            }}>
                                                <div style={{ fontSize: '13px', color: '#111b21', lineHeight: '1.4', whiteSpace: 'pre-wrap' }}>{bodyText}</div>
                                                <div style={{ fontSize: '10px', color: '#8696a0', textAlign: 'right', marginTop: '2px' }}>
                                                    {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                </div>
                                                {buttonsComp?.buttons?.map((btn, idx) => (
                                                    <div key={idx} style={{
                                                        borderTop: '1px solid #e9ecef', padding: '8px 6px',
                                                        textAlign: 'center', fontSize: '13px',
                                                        color: btn.type === 'PHONE_NUMBER' ? '#25D366' : '#00a5f4', fontWeight: 500,
                                                    }}>
                                                        {btn.text}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                    <button className="btn btn--outline" onClick={() => setShowNewChat(false)}>Cancel</button>
                                    <button
                                        className="btn btn--success"
                                        onClick={handleStartNewChat}
                                        disabled={!newChatTemplate || newChatSending}
                                    >
                                        {newChatSending ? 'Sending...' : '\uD83D\uDCAC Send & Start Chat'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
