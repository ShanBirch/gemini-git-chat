import { GoogleGenerativeAI } from "https://cdn.jsdelivr.net/npm/@google/generative-ai/+esm";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// DOM Elements
const chatHistory = document.getElementById('chat-history');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.getElementById('stop-btn');
const geminiKeyInput = document.getElementById('gemini-key');
const githubTokenInput = document.getElementById('github-token');
const githubRepoSelect = document.getElementById('github-repo');
const githubBranchInput = document.getElementById('github-branch');
const saveSettingsBtn = document.getElementById('save-settings');
const repoStatus = document.getElementById('repo-status');
const settingsContent = document.getElementById('settings-content');
const toggleSettingsBtn = document.getElementById('toggle-settings');
const chatModelSelect = document.getElementById('chat-model-select');
const imageInput = document.getElementById('image-input');
const attachBtn = document.getElementById('attach-btn');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image-btn');
const supabaseUrlInput = document.getElementById('supabase-url');
const supabaseKeyInput = document.getElementById('supabase-key');
const enableSyncBtn = document.getElementById('enable-sync');
const deepseekKeyInput = document.getElementById('deepseek-key');
const minimaxKeyInput = document.getElementById('minimax-key');
const productionUrlInput = document.getElementById('production-url');
const planningModeToggle = document.getElementById('planning-mode-toggle');
const indexRepoBtn = document.getElementById('index-repo-btn');

// Mobile and Tabs
const sidebar = document.getElementById('sidebar');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const chatListEl = document.getElementById('chat-list');
const newChatBtn = document.getElementById('new-chat-btn');
const mobileChatTitle = document.getElementById('current-chat-title-mobile');
const authBtn = document.getElementById('auth-btn');
const userInfo = document.getElementById('user-info');
const userEmailText = document.getElementById('user-email');

// App State
let genAI = null;
let currentAiModel = null;
let githubHeaders = {};
let currentRepo = "";
let currentBranch = "main";
let isProcessing = false;
let currentAbortController = null;
let queuedMessages = [];
let buildStatusCheckInterval = null;
let currentAttachedImage = null; // { mimeType: string, data: string (base64) }
let supabase = null;
let syncEnabled = false;

// Pull to refresh state
let touchStart = 0;
let pullDistance = 0;
const PULL_THRESHOLD = 80;
let wakeLock = null;
let notificationsEnabled = false;

// Chat State
let chats = [];
let currentChatId = null;
const fileCache = new Map();
let chatSessions = {};
let localTerminalEnabled = false;

// --- Utilities ---
function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// --- Mobile Background 'Stay-Alive' Hack ---
// Playing silent audio prevents mobile browsers from suspending JS in the background.
const BackgroundKeeper = {
    audioCtx: null,
    osc: null,
    start() {
        try {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
            this.osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            gain.gain.value = 0.001; // Inaudible
            this.osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            this.osc.start();
            console.log("Background Stay-Alive Active");
        } catch (e) { console.warn("Background Stay-Alive failed:", e); }
    },
    stop() {
        if (this.osc) {
            try { this.osc.stop(); } catch(e){}
            this.osc = null;
        }
    }
};

// Initialize
async function init() {
    // Safety Reset: Force page back to top transform on load
    document.getElementById('pull-to-refresh').style.transform = 'translateY(0)';
    document.getElementById('app').style.transform = 'translateY(0)';
    
    await loadSettings();
    loadChats();
    setupEventListeners();
    initAuth();
    checkLocalTerminal();
    marked.setOptions({ breaks: true, gfm: true });
    startBuildStatusPolling();
}

async function checkLocalTerminal() {
    try {
        const res = await fetch('http://localhost:3000/api/status');
        if (res.ok) {
            localTerminalEnabled = true;
            const statusEl = document.getElementById('local-status');
            if (statusEl) statusEl.innerHTML = `💻 Terminal: <span style="color:var(--success)">Online</span>`;
        }
    } catch (e) {
        localTerminalEnabled = false;
    }
}


// Event Listeners
function setupEventListeners() {
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    });
    saveSettingsBtn.addEventListener('click', () => {
        saveSettings();
        const originalText = saveSettingsBtn.textContent;
        saveSettingsBtn.textContent = "Saved ✓";
        setTimeout(() => saveSettingsBtn.textContent = originalText, 2000);
        startBuildStatusPolling(); // Restart with new settings
    });
    sendBtn.addEventListener('click', handleSend);
    stopBtn.addEventListener('click', stopGeneration);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    mobileMenuBtn.addEventListener('click', openSidebar);
    closeSidebarBtn.addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);
    toggleSettingsBtn.addEventListener('click', () => settingsContent.classList.toggle('active'));
    newChatBtn.addEventListener('click', () => {
        createNewChat();
        if (window.innerWidth <= 768) closeSidebar();
    });
    chatModelSelect.addEventListener('change', () => {
        const chat = chats.find(c => c.id === currentChatId);
        if (chat) {
            chat.model = chatModelSelect.value;
            saveChats();
            delete chatSessions[currentChatId];
            setupAI(); // Re-initialize with new model
        }
    });
    planningModeToggle.addEventListener('change', () => {
        setupAI();
    });
    const notifyBtn = document.getElementById('notify-toggle-btn');
    notifyBtn?.addEventListener('click', async () => {
        const enabled = await requestNotificationPermission();
        if (enabled) {
            notifyBtn.classList.add('active');
            notifyBtn.innerHTML = '<span class="icon">notifications_active</span>';
        } else {
            alert("Notification permission denied or not supported.");
        }
    });
    if (indexRepoBtn) indexRepoBtn.addEventListener('click', () => sbIndexRepo());

    attachBtn.addEventListener('click', (e) => {
        e.preventDefault();
        imageInput.click();
    });
    
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64Data = event.target.result.split(',')[1];
                currentAttachedImage = {
                    mimeType: file.type,
                    data: base64Data
                };
                imagePreview.src = event.target.result;
                imagePreviewContainer.style.display = 'flex';
                // Reset input value so same file can be selected again
                imageInput.value = '';
            };
            reader.readAsDataURL(file);
        }
    });

    removeImageBtn.addEventListener('click', () => {
        currentAttachedImage = null;
        imagePreviewContainer.style.display = 'none';
        imageInput.value = '';
    });

    enableSyncBtn.addEventListener('click', initSupabase);
    
    document.getElementById('copy-sync-link')?.addEventListener('click', () => {
        const url = new URL(window.location.href);
        const sUrl = supabaseUrlInput.value.trim();
        const sKey = supabaseKeyInput.value.trim();
        if(!sUrl || !sKey) { alert("Enable Cloud Sync first!"); return; }
        
        url.searchParams.set('s', btoa(sUrl));
        url.searchParams.set('k', btoa(sKey));
        navigator.clipboard.writeText(url.toString());
        alert("Sync Link copied! Bookmark this URL to never re-enter keys again. 🔗");
    });

    authBtn.addEventListener('click', () => {
        if (netlifyIdentity.currentUser()) {
            netlifyIdentity.logout();
        } else {
            netlifyIdentity.open();
        }
    });
    
    document.getElementById('verify-models-link')?.addEventListener('click', async (e) => {
        e.preventDefault();
        const key = geminiKeyInput.value.trim();
        if (!key) { alert("Enter an API key first."); return; }
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            const data = await res.json();
            if (data.models) {
                const names = data.models.map(m => m.name.replace('models/', '')).join('\n');
                alert("Your key has access to:\n" + names);
            } else {
                alert("Could not list models. Check your key.");
            }
        } catch (e) { alert("Error: " + e.message); }
    });

    chatInput.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64Data = event.target.result.split(',')[1];
                    currentAttachedImage = {
                        mimeType: file.type,
                        data: base64Data
                    };
                    imagePreview.src = event.target.result;
                    imagePreviewContainer.style.display = 'flex';
                };
                reader.readAsDataURL(file);
            }
        }
    });

    // Pull to Refresh Logic
    const pullToRefreshEl = document.getElementById('pull-to-refresh');
    const appEl = document.getElementById('app');
    let isPulling = false;

    window.addEventListener('touchstart', (e) => {
        if (chatHistory.scrollTop <= 0) {
            isPulling = true;
            touchStart = e.touches[0].pageY;
        } else {
            isPulling = false;
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        const touchCurrent = e.touches[0].pageY;
        if (chatHistory.scrollTop <= 0) {
            if (touchCurrent > touchStart) {
                pullDistance = Math.min((touchCurrent - touchStart) * 0.5, 120);
                pullToRefreshEl.style.transform = `translateY(${pullDistance}px)`;
                appEl.style.transform = `translateY(${pullDistance}px)`;
                if (pullDistance >= PULL_THRESHOLD) {
                    pullToRefreshEl.querySelector('span').textContent = "Release to refresh...";
                } else {
                    pullToRefreshEl.querySelector('span').textContent = "Pull to refresh...";
                }
            } else if (pullDistance > 0) {
                pullDistance = 0;
                pullToRefreshEl.style.transform = `translateY(0)`;
                appEl.style.transform = `translateY(0)`;
            }
        }
    }, { passive: true });

    const handleTouchEnd = () => {
        if (pullDistance >= PULL_THRESHOLD) {
            pullToRefreshEl.querySelector('span').textContent = "Refreshing...";
            // Reset transforms immediately BEFORE reload to avoid sticky state
            pullToRefreshEl.style.transform = `translateY(0)`;
            appEl.style.transform = `translateY(0)`;
            setTimeout(() => window.location.reload(), 100);
        } else {
            pullToRefreshEl.style.transform = `translateY(0)`;
            appEl.style.transform = `translateY(0)`;
        }
        pullDistance = 0;
    };

    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true });
}

function stopGeneration() {
    if (currentAbortController) {
        currentAbortController.abort();
    }
}

function setProcessingState(processing) {
    isProcessing = processing;
    if (processing) {
        sendBtn.style.display = 'none';
        stopBtn.style.display = 'flex';
    } else {
        sendBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
    }
}

function openSidebar() { sidebar.classList.add('open'); sidebarOverlay.classList.add('active'); }
function closeSidebar() { sidebar.classList.remove('open'); sidebarOverlay.classList.remove('active'); }

// --- Chat Management ---
function loadChats() {
    const savedChats = localStorage.getItem('gitchat_sessions');
    if (savedChats) { try { chats = JSON.parse(savedChats); } catch(e) { chats = []; } }
    if (chats.length === 0) createNewChat();
    else { currentChatId = chats[0].id; renderChatList(); renderCurrentChat(); }
}

const debouncedSync = debounce(() => pushChatsToCloud(), 3000);

function saveChats() {
    localStorage.setItem('gitchat_sessions', JSON.stringify(chats));
    if (syncEnabled) debouncedSync();
}

function createNewChat() {
    const newChat = { id: Date.now().toString(), title: "New Chat", messages: [], model: chatModelSelect.value, createdAt: new Date().toISOString() };
    chats.unshift(newChat);
    currentChatId = newChat.id;
    setupAI(); // Ensure model object exists for startChat
    if (genAI && currentAiModel) chatSessions[currentChatId] = currentAiModel.startChat({ history: [] });
    saveChats();
    renderChatList();
    renderCurrentChat();
}

function switchChat(id) {
    if (currentChatId === id) return;
    currentChatId = id;
    renderChatList();
    renderCurrentChat();
    setupAI();
    if (window.innerWidth <= 768) closeSidebar();
}

function deleteChat(id, e) {
    e.stopPropagation();
    chats = chats.filter(c => c.id !== id);
    delete chatSessions[id];
    if (chats.length === 0) createNewChat();
    else if (currentChatId === id) currentChatId = chats[0].id;
    saveChats(); renderChatList(); renderCurrentChat();
}

// --- Wake Lock ---
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            BackgroundKeeper.start();
        } catch (err) { console.log("WakeLock failed"); }
    } else {
        // Fallback for browsers without WakeLock support
        BackgroundKeeper.start();
    }
}

function releaseWakeLock() {
    BackgroundKeeper.stop();
    if (wakeLock) {
        wakeLock.release().then(() => wakeLock = null);
    }
}

// Auto-reacquire wake lock when returning to the tab
document.addEventListener('visibilitychange', async () => {
    if (isProcessing && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

async function requestNotificationPermission() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    notificationsEnabled = (permission === "granted");
    return notificationsEnabled;
}

function sendCompletionNotification(content) {
    if (notificationsEnabled && document.visibilityState === 'hidden') {
        new Notification("✨ GitChat AI Task Complete", {
            body: content.length > 100 ? content.substring(0, 100) + "..." : content,
            icon: "/icon.svg"
        });
    }
}

function renderChatList() {
    chatListEl.innerHTML = '';
    chats.forEach(chat => {
        const tab = document.createElement('div');
        tab.className = `chat-tab ${chat.id === currentChatId ? 'active' : ''}`;
        tab.innerHTML = `<span class="chat-tab-title">${chat.title}</span><button class="delete-chat-btn" title="Delete session">✕</button>`;
        tab.addEventListener('click', () => switchChat(chat.id));
        tab.querySelector('.delete-chat-btn').addEventListener('click', (e) => deleteChat(chat.id, e));
        chatListEl.appendChild(tab);
    });
}

function renderCurrentChat() {
    chatHistory.innerHTML = '';
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) return;
    mobileChatTitle.textContent = chat.title;
    
    // Validate model selection
    const validModels = Array.from(chatModelSelect.options).map(o => o.value);
    if (chat.model && validModels.includes(chat.model)) {
        chatModelSelect.value = chat.model;
    } else {
        chatModelSelect.value = 'gemini-3-flash-preview';
    }

    if (chat.messages.length === 0) {
        chatHistory.innerHTML = `<div class="empty-state"><h1>GitChat AI</h1><p>Your autonomous codebase agent. Connect your repository to get started.</p></div>`;
    } else {
        chat.messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${msg.role}`;
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            if (msg.role === 'ai') {
                contentDiv.innerHTML = marked.parse(msg.content);
            } else { 
                if (msg.image) {
                    const img = document.createElement('img');
                    img.src = `data:${msg.image.mimeType};base64,${msg.image.data}`;
                    img.style.maxWidth = '100%';
                    img.style.borderRadius = '8px';
                    img.style.marginBottom = '8px';
                    img.style.display = 'block';
                    contentDiv.appendChild(img);
                }
                const textSpan = document.createElement('span');
                textSpan.textContent = msg.content;
                contentDiv.appendChild(textSpan);
            }
            msgDiv.appendChild(contentDiv);
            chatHistory.appendChild(msgDiv);
        });
        setTimeout(() => {
            chatHistory.querySelectorAll('pre code').forEach((block) => Prism.highlightElement(block));
            scrollToBottom();
        }, 10);
    }
}

function addMessageToCurrent(role, content) {
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) return;
    if (chat.messages.length === 0 && role === 'user') {
        chat.title = content.length > 25 ? content.substring(0, 25) + '...' : content;
        renderChatList();
        mobileChatTitle.textContent = chat.title;
    }
    chat.messages.push({ role, content, image: currentAttachedImage });
    saveChats();
    
    // Auto-name after first AI response
    if (role === 'ai' && chat.messages.length <= 3 && chat.title === "New Chat") {
        generateAutoTitle(chat);
    }
}

async function generateAutoTitle(chat) {
    if (!genAI) return;
    try {
        // Always use Flash for titles to be fast/stable/cheap
        const titleModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const historyText = chat.messages.map(m => `${m.role}: ${m.content.substring(0, 100)}`).join('\n');
        const prompt = `Summarize this conversation into a short, catchy 2-4 word title. Respond with ONLY the title. No quotes. \n\nConversation:\n${historyText}`;
        const result = await titleModel.generateContent(prompt);
        const title = result.response.text().trim().replace(/["']/g, '');
        if (title && title.length < 50) {
            chat.title = title;
            saveChats();
            renderChatList();
            mobileChatTitle.textContent = title;
        }
    } catch (e) { console.warn("Auto-title used fallback", e); }
}

// Settings Management
async function loadSettings() {
    // Fetch configuration from secure proxy
    try {
        const user = window.netlifyIdentity.currentUser();
        if (!user) return;

        const token = await user.jwt();
        const res = await fetch('/.netlify/functions/get-config', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            const config = await res.json();
            console.log("Config loaded successfully:", Object.keys(config).filter(k => !!config[k]));
            
            geminiKeyInput.value = config.GEMINI_API_KEY || '';
            githubTokenInput.value = config.GITHUB_TOKEN || '';
            supabaseUrlInput.value = config.SUPABASE_URL || '';
            supabaseKeyInput.value = config.SUPABASE_KEY || '';
            productionUrlInput.value = config.PRODUCTION_URL || '';
            
            if (geminiKeyInput.value) setupAI();
            if (githubTokenInput.value) {
                fetchUserRepos(localStorage.getItem('gitchat_github_repo') || '');
                testGitHubConnection();
            }
            if (supabaseUrlInput.value && supabaseKeyInput.value) await initSupabase(true);
        } else {
            console.error("Failed to fetch secure config. Status:", res.status);
        }
    } catch (e) {
        console.error("Failed to load secure config:", e);
    }
}

function saveSettings() {
    localStorage.setItem('gitchat_gemini_key', geminiKeyInput.value.trim());
    localStorage.setItem('gitchat_github_token', githubTokenInput.value.trim());
    localStorage.setItem('gitchat_github_repo', githubRepoSelect.value);
    localStorage.setItem('gitchat_github_branch', githubBranchInput.value.trim());
    localStorage.setItem('gitchat_deepseek_key', deepseekKeyInput.value.trim());
    localStorage.setItem('gitchat_minimax_key', minimaxKeyInput.value.trim());
    localStorage.setItem('gitchat_production_url', productionUrlInput.value.trim());
    settingsContent.classList.remove('active');
    setupAI();
    fetchUserRepos(githubRepoSelect.value);
    testGitHubConnection();
    if (syncEnabled) pushSettingsToCloud();
}

async function initSupabase(silent = false) {
    const url = supabaseUrlInput.value.trim();
    const key = supabaseKeyInput.value.trim();
    if (!url || !key) { if(!silent) alert("Please enter both Supabase URL and Key"); return; }

    try {
        supabase = createClient(url, key);
        syncEnabled = true;
        localStorage.setItem('gitchat_supabase_url', url);
        localStorage.setItem('gitchat_supabase_key', key);
        enableSyncBtn.textContent = "Cloud Sync Active 🟢";
        enableSyncBtn.style.color = "var(--success)";
        
        // Check for existing settings in cloud
        const { data, error } = await supabase.from('settings').select('data').eq('id', 'user_settings').single();
        if (data && data.data) {
            const cloud = data.data;
            // Only pull if local is empty OR if this is a fresh sync init
            if (!geminiKeyInput.value || !githubTokenInput.value || !silent) {
                geminiKeyInput.value = cloud.gemini_key || geminiKeyInput.value;
                githubTokenInput.value = cloud.github_token || githubTokenInput.value;
                githubBranchInput.value = cloud.github_branch || githubBranchInput.value;
                deepseekKeyInput.value = cloud.deepseek_key || deepseekKeyInput.value;
                minimaxKeyInput.value = cloud.minimax_key || minimaxKeyInput.value;
                productionUrlInput.value = cloud.production_url || productionUrlInput.value;
                localStorage.setItem('gitchat_gemini_key', geminiKeyInput.value);
                localStorage.setItem('gitchat_github_token', githubTokenInput.value);
                localStorage.setItem('gitchat_github_branch', githubBranchInput.value);
                localStorage.setItem('gitchat_deepseek_key', deepseekKeyInput.value);
                localStorage.setItem('gitchat_minimax_key', minimaxKeyInput.value);
                localStorage.setItem('gitchat_production_url', productionUrlInput.value);
                if (cloud.github_repo) localStorage.setItem('gitchat_github_repo', cloud.github_repo);
                setupAI();
                if(!silent) alert("Settings restored from Cloud! ☁️✨");
            }
        } else {
            // First time? Push local to cloud
            pushSettingsToCloud();
        }
        
        pullChatsFromCloud(silent);
    } catch (e) {
        if(!silent) alert("Supabase connection failed: " + e.message);
    }
}

async function pullChatsFromCloud(silent = false) {
    if (!supabase) return;
    const { data, error } = await supabase.from('app_state').select('data').eq('id', 'chat_sessions').single();
    if (data && data.data) {
        chats = data.data;
        saveChats();
        renderChatList();
        renderCurrentChat();
        if(!silent) alert("Chats restored from Cloud! ☁️");
    }
}

async function pushSettingsToCloud() {
    if (!supabase) return;
    const settings = {
        gemini_key: geminiKeyInput.value.trim(),
        github_token: githubTokenInput.value.trim(),
        github_repo: githubRepoSelect.value,
        github_branch: githubBranchInput.value.trim(),
        deepseek_key: deepseekKeyInput.value.trim(),
        minimax_key: minimaxKeyInput.value.trim(),
        production_url: productionUrlInput.value.trim()
    };
    await supabase.from('settings').upsert({ id: 'user_settings', data: settings });
}

async function pushChatsToCloud() {
    if (!supabase) return;
    await supabase.from('app_state').upsert({ id: 'chat_sessions', data: chats });
}

async function fetchUserRepos(selectedRepo = "") {
    const token = githubTokenInput.value.trim();
    if (!token) {
        githubRepoSelect.innerHTML = '<option value="">Enter token first</option>';
        return;
    }

    try {
        const headers = { "Accept": "application/vnd.github.v3+json", "Authorization": `Bearer ${token}` };
        const res = await fetch(`https://api.github.com/user/repos?sort=updated&per_page=100`, { headers });
        if (res.ok) {
            const repos = await res.json();
            githubRepoSelect.innerHTML = '';
            
            if (selectedRepo && !repos.find(r => r.full_name === selectedRepo)) {
                const opt = document.createElement('option');
                opt.value = selectedRepo;
                opt.textContent = selectedRepo;
                githubRepoSelect.appendChild(opt);
            }

            repos.forEach(repo => {
                const opt = document.createElement('option');
                opt.value = repo.full_name;
                opt.textContent = repo.full_name;
                githubRepoSelect.appendChild(opt);
            });
            
            if (selectedRepo) githubRepoSelect.value = selectedRepo;
        } else {
            const errData = await res.json().catch(() => ({}));
            const msg = errData.message || `Status ${res.status}`;
            console.error("GitHub API Error:", msg);
            githubRepoSelect.innerHTML = `<option value="">GitHub Err: ${msg}</option>`;
        }
    } catch (e) {
        githubRepoSelect.innerHTML = '<option value="">Connection failed</option>';
    }
}

// --- GitHub API Integration ---
async function testGitHubConnection() {
    currentRepo = githubRepoSelect.value;
    currentBranch = githubBranchInput.value.trim();
    const token = githubTokenInput.value.trim();
    if (!currentRepo || !token) { updateStatus("Missing credentials", "error"); return; }
    githubHeaders = { "Accept": "application/vnd.github.v3+json", "Authorization": `token ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
    try {
        updateStatus("Connecting...", "neutral");
        const res = await fetch(`https://api.github.com/repos/${currentRepo}`, { headers: githubHeaders });
        if (res.ok) { const data = await res.json(); updateStatus(`Connected: ${data.name}`, "ok"); } 
        else updateStatus(`Error: ${res.status}`, "error");
    } catch (e) { updateStatus("Connection failed", "error"); }
}

function updateStatus(text, type) {
    repoStatus.className = `repo-status status-${type}`;
    repoStatus.querySelector('span').textContent = text;
}

async function ghListFiles(path = "") {
    try {
        const url = `https://api.github.com/repos/${currentRepo}/contents/${path}?ref=${currentBranch}`;
        const res = await fetch(url, { headers: githubHeaders });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) return `Path '${path}' is a file.`;
        const result = data.map(item => `${item.type === 'dir' ? '📁' : '📄'} ${item.path}`).join('\n') || "Empty directory.";
        return result;
    } catch (e) { return `Error: ${e.message}`; }
}

const pendingReads = new Map();
async function ghReadFile(path) {
    if (fileCache.has(path)) return fileCache.get(path);
    if (pendingReads.has(path)) return pendingReads.get(path);

    const readPromise = (async () => {
        try {
            const url = `https://api.github.com/repos/${currentRepo}/contents/${path}?ref=${currentBranch}`;
            const res = await fetch(url, { headers: githubHeaders });
            if (!res.ok) throw new Error(`${res.status}`);
            const data = await res.json();
            if (data.type !== 'file') return `Not a file.`;
            const binaryString = atob(data.content.replace(/\s/g, ''));
            const bytes = new Uint8Array(binaryString.length);
            for (let i=0; i<binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            const content = new TextDecoder('utf-8').decode(bytes);
            fileCache.set(path, content);
            return content;
        } catch (e) { return `Error: ${e.message}`; }
        finally { pendingReads.delete(path); }
    })();

    pendingReads.set(path, readPromise);
    return readPromise;
}

async function ghViewFile(path, startLine, endLine) {
    let content = fileCache.get(path);
    if (!content) {
        content = await ghReadFile(path);
        if (content.startsWith("Error:")) return content;
    }
    const lines = content.split('\n');
    const totalLines = lines.length;
    
    if (startLine === undefined || startLine === null) startLine = 1;
    if (endLine === undefined || endLine === null) endLine = Math.min(startLine + 200, totalLines);
    
    startLine = Math.max(1, startLine);
    endLine = Math.min(totalLines, endLine);
    
    if (startLine > endLine) return "Error: start_line is greater than end_line";
    
    let result = lines.slice(startLine - 1, endLine).map((line, i) => `${startLine + i}: ${line}`).join('\n');
    if (result.length > 30000) {
        result = result.substring(0, 30000) + "\n... [TRUNCATED - Too many lines!]";
    }
    return `File: ${path}\nLines: ${startLine} to ${endLine} of ${totalLines}\n\n${result}`;
}

async function ghGrepSearch(path, query) {
    let content = fileCache.get(path);
    if (!content) {
        content = await ghReadFile(path);
        if (content.startsWith("Error:")) return content;
    }
    const lines = content.split('\n');
    let results = [];
    const lowerQuery = query.toLowerCase();
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
            results.push(`${i + 1}: ${lines[i]}`);
        }
    }
    if (results.length === 0) return `No matches found for '${query}' in ${path}.`;
    if (results.length > 100) return `Found ${results.length} matches. Showing first 100:\n` + results.slice(0, 100).join('\n');
    return results.join('\n');
}

async function ghGetRepoMap(forceRefresh = false) {
    const cacheKey = `gitchat_map_${currentRepo}_${currentBranch}`;
    if (!forceRefresh) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) return cached;
    }

    try {
        const url = `https://api.github.com/repos/${currentRepo}/git/trees/${currentBranch}?recursive=1`;
        const res = await fetch(url, { headers: githubHeaders });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        
        let map = "";
        if (data.tree.length > 1000) {
            // Massive Repo Optimization: Just show top-level structure and key files
            const topLevel = data.tree.filter(item => !item.path.includes('/'));
            map = "Repo is massive (>1000 files). Only showing top-level items. Use 'list_files' for deep exploration.\n\n" + 
                  topLevel.map(item => `${item.type === 'tree' ? '📁' : '📄'} ${item.path}`).join('\n');
        } else {
            map = data.tree.map(item => `${item.type === 'tree' ? '📁' : '📄'} ${item.path}`).join('\n');
        }
        
        try { localStorage.setItem(cacheKey, map); } catch(e) { console.warn("Repo map too large for localStorage"); }
        return map;
    } catch (e) { return `Error: ${e.message}`; }
}

async function ghSearchCode(query) {
    // GitHub code search only returns file paths — we enhance it by also grepping those files
    try {
        const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}+repo:${currentRepo}`;
        const res = await fetch(url, { headers: githubHeaders });
        if (!res.ok) throw new Error(`GitHub search ${res.status} - rate limited? Try grep_search on a specific file instead.`);
        const data = await res.json();
        if (!data.items || data.items.length === 0) return `No files found containing '${query}'. Try grep_search on a specific file if you already know which file it's in.`;
        
        const files = data.items.slice(0, 5).map(item => item.path);
        
        // Auto-grep the top results in parallel so we return actual line numbers quickly
        let output = `Found in ${data.items.length} file(s). Top results with matching lines:\n\n`;
        const grepPromises = files.map(path => ghGrepSearch(path, query).then(res => ({ path, res })));
        const grepResults = await Promise.all(grepPromises);
        
        for (const { path, res } of grepResults) {
            output += `📄 ${path}:\n${res}\n\n`;
        }
        output += `💡 Use view_file with the line numbers above to read context, then patch_file to edit.`;
        return output;
    } catch (e) { return `Error: ${e.message}`; }
}

async function ghPatchFile(path, search, replace, commit_message) {
    try {
        // Use cached content if available — avoid unnecessary re-download
        let original = fileCache.get(path);
        if (!original) {
            original = await ghReadFile(path);
            if (original.startsWith("Error:")) return original;
        }
        
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matches = original.match(new RegExp(escapeRegExp(search), 'g')) || [];
        if (matches.length === 0) {
            return `Error: Did not find the exact 'search' text in ${path}. Ensure whitespace/indentation exactly matches what you read via view_file. Tip: Use grep_search to find the exact line, then view_file around it.`;
        }
        if (matches.length > 1) {
            return `Error: Found ${matches.length} occurrences. Provide a longer, more unique search block (e.g., include 2-3 surrounding lines).`;
        }
        
        const updated = original.replace(search, replace);
        // ghWriteFile now updates cache itself — no need to bust it
        return await ghWriteFile(path, updated, commit_message || `Patch ${path}`);
    } catch (e) { return `Error patching: ${e.message}`; }
}

async function ghRunTerminalCommand(command, cwd) {
    if (!localTerminalEnabled) return "Error: Local terminal is not connected. Run 'npm start' in the gemini-git-chat folder.";
    try {
        const res = await fetch('http://localhost:3000/api/shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command, cwd })
        });
        const data = await res.json();
        let output = `[EXIT CODE ${data.exitCode}]\n`;
        if (data.stdout) output += `STDOUT:\n${data.stdout}\n`;
        if (data.stderr) output += `STDERR:\n${data.stderr}\n`;
        if (data.error) output += `ERROR:\n${data.error}\n`;
        return output;
    } catch (e) { return `Error connecting to local terminal: ${e.message}`; }
}


async function ghGetBuildStatus() {
    if (!githubHeaders || !currentRepo) return "Not connected.";
    try {
        const res = await fetch(`https://api.github.com/repos/${currentRepo}/commits/${currentBranch}/check-runs`, { headers: githubHeaders });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (data.check_runs.length === 0) return "No active build/CI checks.";
        return data.check_runs.map(run => 
            `🛠️ ${run.name}: ${run.status} (${run.conclusion || 'pending'})\nSummary: ${run.output?.summary || 'No output'}`
        ).join('\n---\n');
    } catch (e) { return `Error fetching build status: ${e.message}`; }
}

// --- Semantic Search (Supabase) ---
async function getEmbedding(text) {
    if (!genAI) return null;
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    return result.embedding.values;
}

async function sbIndexRepo() {
    if (!supabase || !currentRepo) { alert("Please connect Supabase and GitHub first."); return; }
    
    updateStatus("Indexing Brain...", "neutral");
    indexRepoBtn.textContent = "Indexing... ⏳";
    indexRepoBtn.disabled = true;

    try {
        const repoMapStr = await ghGetRepoMap(true);
        const files = repoMapStr.split('\n')
            .filter(f => f.startsWith('📄'))
            .map(f => f.replace('📄 ', ''))
            .filter(f => /\.(js|ts|py|html|css|md|json)$/.test(f)) // Only index common code files
            .filter(f => !f.includes('node_modules') && !f.includes('.git'));

        // Clear existing index for this repo
        await supabase.from('repo_index').delete().eq('repo_name', currentRepo);

        let count = 0;
        for (const path of files) {
            const content = await ghReadFile(path);
            if (content.length > 30000) continue; // Skip massive files for now or chunk them
            
            // Simple chunking: 1000 characters per chunk (approx)
            const chunks = content.match(/[\s\S]{1,4000}/g) || [content];
            
            for (const chunk of chunks) {
                const embedding = await getEmbedding(chunk);
                if (embedding) {
                    await supabase.from('repo_index').insert({
                        repo_name: currentRepo,
                        file_path: path,
                        content: chunk,
                        embedding: embedding
                    });
                }
            }
            count++;
            indexRepoBtn.textContent = `Indexed ${count}/${files.length}`;
        }
        
        alert(`Successfully indexed ${files.length} files! GitChat now has 'Semantic Memory' for this repo.`);
        updateStatus("Brain Indexed ✨", "ok");
    } catch (e) {
        console.error("Indexing failed:", e);
        alert("Indexing failed: " + e.message);
    } finally {
        indexRepoBtn.textContent = "Index Repo (Semantic Search) 🧠";
        indexRepoBtn.disabled = false;
    }
}

async function sbSemanticSearch(query) {
    if (!supabase) return "Supabase not connected.";
    try {
        const queryEmbedding = await getEmbedding(query);
        const { data, error } = await supabase.rpc('match_code', {
            query_embedding: queryEmbedding,
            match_threshold: 0.5,
            match_count: 5,
            repo_filter: currentRepo
        });
        
        if (error) throw error;
        if (!data || data.length === 0) return "No semantically similar code found. Try a different query.";
        
        return data.map(match => `--- File: ${match.file_path} (Similarity: ${Math.round(match.similarity * 100)}%) ---\n${match.content}`).join('\n\n');
    } catch (e) { return `Search error: ${e.message}`; }
}

// --- Personal Memory (Supabase) ---
async function sbRememberFact(fact, category = "general") {
    if (!supabase) return "Supabase not connected.";
    try {
        const embedding = await getEmbedding(fact);
        const { error } = await supabase.from('user_memories').insert({
            content: fact,
            embedding: embedding,
            category: category
        });
        if (error) throw error;
        return "Memory saved successfully.";
    } catch (e) { return `Memory error: ${e.message}`; }
}

async function sbRecallMemories(query) {
    if (!supabase) return "Supabase not connected.";
    try {
        const queryEmbedding = await getEmbedding(query);
        const { data, error } = await supabase.rpc('match_memories', {
            query_embedding: queryEmbedding,
            match_threshold: 0.4,
            match_count: 3
        });
        if (error) throw error;
        if (!data || data.length === 0) return "No relevant personal memories found.";
        return data.map(m => `💡 Memory: ${m.content}`).join('\n');
    } catch (e) { return `Memory recall error: ${e.message}`; }
}

// --- Lighthouse Audits (PageSpeed Insights API) ---
async function ghRunLighthouse() {
    let url = productionUrlInput.value.trim();
    if (!url) return "Error: No Production/Netlify URL configured in settings.";
    
    // Ensure protocol exists
    if (!url.startsWith('http')) url = 'https://' + url;
    
    try {
        const apiEndpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=PERFORMANCE&category=SEO&category=ACCESSIBILITY&category=BEST_PRACTICES`;
        const res = await fetch(apiEndpoint);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        
        const categories = data.lighthouseResult.categories;
        const result = {
            performance: Math.round(categories.performance.score * 100),
            seo: Math.round(categories.seo.score * 100),
            accessibility: Math.round(categories.accessibility.score * 100),
            bestPractices: Math.round(categories['best-practices'].score * 100)
        };

        const topIssues = data.lighthouseResult.audits['modern-image-formats']?.details?.items || [];
        let summary = `Lighthouse Report for ${url}:\n`;
        summary += `- Performance: ${result.performance}%\n- SEO: ${result.seo}%\n- Accessibility: ${result.accessibility}%\n- Best Practices: ${result.bestPractices}%\n\n`;
        
        if (topIssues.length > 0) {
            summary += `⚠️ Key Optimization Opportunity: Consider converting high-res images to WebP/AVIF to save ${Math.round(topIssues[0].wastedBytes / 1024)}KB.`;
        }
        
        return summary;
    } catch (e) { return `Lighthouse error: ${e.message}`; }
}

async function ghWriteFile(path, content, commit_message) {
    try {
        let sha = undefined;
        // 1. Get current file SHA if it exists
        const getRes = await fetch(`https://api.github.com/repos/${currentRepo}/contents/${path}?ref=${currentBranch}`, { headers: githubHeaders });
        if (getRes.ok) {
            const getData = await getRes.json();
            sha = getData.sha;
        }

        // 2. Prepare content - Fast chunked Base64 for UTF-8 (avoids slow char loop)
        const bytes = new TextEncoder().encode(content);
        const CHUNK = 8192;
        let binaryString = "";
        for (let i = 0; i < bytes.byteLength; i += CHUNK) {
            binaryString += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        const base64Content = btoa(binaryString);

        // 3. Send update
        const body = { 
            message: commit_message || `Update ${path}`, 
            content: base64Content, 
            branch: currentBranch 
        };
        if (sha) body.sha = sha;

        const putRes = await fetch(`https://api.github.com/repos/${currentRepo}/contents/${path}`, {
            method: 'PUT',
            headers: { ...githubHeaders, "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!putRes.ok) {
            const errData = await putRes.json();
            throw new Error(`GitHub Error ${putRes.status}: ${errData.message || errData.statusText}`);
        }

        // Update cache to avoid re-download on next read
        fileCache.set(path, content);
        return `Successfully wrote to ${path}! Changes pushed to branch '${currentBranch}'.`;
    } catch (e) { 
        console.error("Write File Error:", e);
        return `Error writing file: ${e.message}`; 
    }
}

async function ghLineCount(path) {
    let content = fileCache.get(path);
    if (!content) {
        content = await ghReadFile(path);
        if (typeof content === 'string' && content.startsWith("Error:")) return content;
    }
    const lines = content.split('\n').length;
    const sizeKb = Math.round(content.length / 1024);
    return `File: ${path}\nTotal lines: ${lines}\nSize: ~${sizeKb}KB\nTip: Use view_file with start_line/end_line to read specific sections.`;
}

async function ghPatchFileMulti(path, patches, commit_message) {
    // patches = [{search, replace}, ...] — apply all in one GitHub commit
    try {
        let content = fileCache.get(path);
        if (!content) {
            content = await ghReadFile(path);
            if (content.startsWith("Error:")) return content;
        }

        const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const report = [];
        for (const { search, replace } of patches) {
            const matches = content.match(new RegExp(escapeRegExp(search), 'g')) || [];
            if (matches.length === 0) {
                report.push(`ERROR: Did not find: "${search.substring(0,80)}..."`);
                continue;
            }
            if (matches.length > 1) {
                report.push(`ERROR: Found ${matches.length} occurrences of: "${search.substring(0,80)}..." — make it more unique.`);
                continue;
            }
            content = content.replace(search, replace);
            report.push(`OK: Replaced "${search.substring(0,60)}..."`);
        }

        if (report.some(r => r.startsWith('ERROR'))) {
            return `Patch aborted due to errors:\n${report.join('\n')}`;
        }

        const result = await ghWriteFile(path, content, commit_message || `Multi-patch ${path}`);
        return `${result}\n\nPatch report:\n${report.join('\n')}`;
    } catch (e) { return `Error in multi-patch: ${e.message}`; }
}

const toolsMap = { 
    list_files: (args) => ghListFiles(args.path || ""), 
    read_file: (args) => ghReadFile(args.path), 
    view_file: (args) => ghViewFile(args.path, args.start_line, args.end_line),
    grep_search: (args) => ghGrepSearch(args.path, args.query),
    line_count: (args) => ghLineCount(args.path),
    write_file: (args) => ghWriteFile(args.path, args.content, args.commit_message),
    patch_file: (args) => ghPatchFile(args.path, args.search, args.replace, args.commit_message),
    patch_file_multi: (args) => ghPatchFileMulti(args.path, args.patches, args.commit_message),
    get_repo_map: () => ghGetRepoMap(),
    search_code: (args) => ghSearchCode(args.query),
    get_build_status: () => ghGetBuildStatus(),
    semantic_search: (args) => sbSemanticSearch(args.query),
    remember_this: (args) => sbRememberFact(args.fact, args.category),
    recall_memories: (args) => sbRecallMemories(args.query),
    run_lighthouse: () => ghRunLighthouse(),
    run_terminal_command: (args) => ghRunTerminalCommand(args.command, args.cwd)
};

function mapModelName(name) {
    if (!name) return "gemini-3-flash";
    let normalized = name.toLowerCase().trim();
    if (!normalized.startsWith("gemini-") && !normalized.includes("deepseek") && !normalized.includes("minimax")) {
        normalized = "gemini-" + normalized;
    }
    if (normalized.includes("3.1-pro-preview")) return "gemini-3.1-pro-preview";
    if (normalized.includes("3.1-pro")) return "gemini-3.1-pro";
    if (normalized.includes("3-pro-preview") || normalized.includes("3.0-pro-preview")) return "gemini-3-pro-preview";
    if (normalized.includes("3-pro") || normalized.includes("3.0-pro")) return "gemini-3-pro";
    if (normalized.includes("3-flash-preview") || normalized.includes("3.0-flash-preview")) return "gemini-3-flash-preview";
    if (normalized.includes("3-flash") || normalized.includes("3.0-flash")) return "gemini-3-flash";
    if (normalized.includes("2-flash") || normalized.includes("2.0-flash")) return "gemini-2.0-flash";
    if (normalized.includes("2.5-pro")) return "gemini-2.5-pro";
    if (normalized.includes("2.5-flash")) return "gemini-2.5-flash";
    if (normalized.includes("deepseek")) return "deepseek-v3.2";
    if (normalized.includes("minimax")) return "minimax-m2.5";
    return normalized;
}

function getProvider(model) {
    if (model.includes("deepseek")) return "deepseek";
    if (model.includes("minimax")) return "minimax";
    return "google";
}

// --- AI Integration ---
function setupAI() {
    const key = geminiKeyInput.value.trim();
    if (!key) return;
    const chat = chats.find(c => c.id === currentChatId);
    let rawModelName = (chat && chat.model) || chatModelSelect.value || "gemini-3-flash-preview";
    const modelName = mapModelName(rawModelName);
    
    genAI = new GoogleGenerativeAI(key);
    const safetySettings = [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ];

    const isPlanning = planningModeToggle.checked;
    const baseInstruction = `You are GitChat AI, an Elite Autonomous Software Engineer optimizing for speed, accuracy, and decisive action.
Do not second-guess yourself unnecessarily.
CRITICAL: When you perform a "System Upgrade" (improving GitChat's own code), increment the version number in 'index.html' (e.g. from v1.3.0 to v1.4.0).
Repo: '${currentRepo}' | Branch: '${currentBranch}'.`;

    const planningInstruction = `${baseInstruction}
CRITICAL: You are currently in PLANNING MODE.
1. DO NOT use 'write_file' or 'patch_file' yet.
2. Use 'get_repo_map', 'search_code', and 'read_file' to explore the codebase.
3. Propose a detailed step-by-step PLAN of which files you will touch and exactly what changes you will make.
4. Output your plan as a checklist and wait for user approval.
5. If the user says "Go", "Approve", or similar, then you may begin using write/patch tools.`;

    const executionInstruction = `${baseInstruction}

## WORKFLOW — follow this order, do not skip steps:
1. grep_search the most likely file for the key term → get line numbers immediately
2. view_file ±30 lines around the match → read just enough context
3. patch_file or patch_file_multi → make the edit
Done. That's it. 3 steps max before you start editing.

## RULES:
- search_code returns file paths + matching lines. Use it ONCE then switch to grep_search.
- NEVER call the same tool twice with similar args. If a search returns nothing useful, move on.
- NEVER use get_repo_map or list_files unless you genuinely don't know which file to touch.
- NEVER use read_file on large files — it's slow and wastes your context window.
- For large files (lib/learning-inline.js is 12,000+ lines): grep_search → view_file tight range → patch.
- If you are stuck after 3 searches, STOP and ask the user: "I found X at line Y — want me to edit that?"
- patch_file_multi for multiple edits in one commit. patch_file for single edits.
- After patching, check get_build_status. Fix failures.`;

    const geminiTools = [
        { name: "line_count", description: "FAST: Get the total line count and file size WITHOUT reading content. Use this before view_file on any unfamiliar file.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" } }, required: ["path"] } },
        { name: "list_files", description: "List files in a directory.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" } }, required: ["path"] } },
        { name: "get_repo_map", description: "Get the entire repository structure recursively." },
        { name: "search_code", description: "Search for strings/symbols across all files.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
        { name: "grep_search", description: "Search for a pattern/string inside a SPECIFIC file. Returns line numbers. Use this to find WHICH lines to view before calling view_file.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" }, query: { type: "STRING" } }, required: ["path", "query"] } },
        { name: "view_file", description: "View specific lines of a file. ALWAYS provide start_line and end_line to avoid loading huge files. Use grep_search first to find the right line range.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" }, start_line: { type: "INTEGER" }, end_line: { type: "INTEGER" } }, required: ["path"] } },
        { name: "patch_file", description: "Surgical single replacement. Provide enough surrounding context (3-5 lines) in 'search' to make it unique. Prefer patch_file_multi for multiple changes.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" }, search: { type: "STRING" }, replace: { type: "STRING" }, commit_message: { type: "STRING" } }, required: ["path", "search", "replace"] } },
        { name: "patch_file_multi", description: "PREFERRED for large files: Apply multiple surgical replacements to ONE file in a SINGLE commit. Much faster than calling patch_file repeatedly.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" }, patches: { type: "ARRAY", items: { type: "OBJECT", properties: { search: { type: "STRING" }, replace: { type: "STRING" } }, required: ["search", "replace"] } }, commit_message: { type: "STRING" } }, required: ["path", "patches"] } },
        { name: "read_file", description: "Read an ENTIRE file. WARNING: Very slow/expensive on large files. Only use for small config/JSON files. Use view_file+grep_search for code files.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" } }, required: ["path"] } },
        { name: "write_file", description: "Full file overwrite. ONLY use for NEW files or very small files. For existing code, use patch_file.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" }, content: { type: "STRING" }, commit_message: { type: "STRING" } }, required: ["path", "content", "commit_message"] } },
        { name: "get_build_status", description: "Check CI/Build logs." },
        { name: "run_lighthouse", description: "Run a live performance/SEO/Accessibility audit on the production URL." },
        { name: "semantic_search", description: "Find code snippets by meaning/intent using the Supabase index.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
        { name: "remember_this", description: "Save a fact about the user, their tech preferences, or project rules for long-term memory.", parameters: { type: "OBJECT", properties: { fact: { type: "STRING" }, category: { type: "STRING" } }, required: ["fact"] } },
        { name: "recall_memories", description: "Retrieve relevant facts or preferences about the user and their coding style.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } }
    ];

    if (localTerminalEnabled) {
        geminiTools.push({ 
            name: "run_terminal_command", 
            description: "Run a command in the user's local terminal. Use this for tests, builds, or file operations.", 
            parameters: { 
                type: "OBJECT", 
                properties: { 
                    command: { type: "STRING", description: "The shell command to run." },
                    cwd: { type: "STRING", description: "Optional: relative directory to run in." }
                }, 
                required: ["command"] 
            } 
        });
    }

    let finalInstruction = isPlanning ? planningInstruction : executionInstruction;
    if (localTerminalEnabled) {
        finalInstruction += `\n\n## LOCAL TERMINAL ACCESS (ACTIVE):
- You have access to 'run_terminal_command'. Use it for tests, builds, or complex local tasks.
- Project CWD: '${window.location.pathname}'.`;
    }

    currentAiModel = genAI.getGenerativeModel({ 
        model: modelName, 
        safetySettings,
        tools: [{ functionDeclarations: geminiTools }],
        systemInstruction: finalInstruction
    });
}


function getChatSession() {
    if (!chatSessions[currentChatId]) {
        if (!currentAiModel) {
            alert("Model not initialized. Please check your Gemini Key in settings.");
            return null;
        }
        const chat = chats.find(c => c.id === currentChatId);
        const history = chat ? chat.messages.map(m => {
            const parts = [{ text: m.content }];
            if (m.image) {
                parts.unshift({
                    inlineData: {
                        mimeType: m.image.mimeType,
                        data: m.image.data
                    }
                });
            }
            return {
                role: m.role === 'ai' ? 'model' : 'user',
                parts: parts
            };
        }) : [];
        chatSessions[currentChatId] = currentAiModel.startChat({ history });
    }
    return chatSessions[currentChatId];
}

// --- UI Rendering ---
function appendMessageOnly(role, content) {
    if (chatHistory.querySelector('.empty-state')) chatHistory.innerHTML = '';
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    if (role === 'ai') {
        contentDiv.innerHTML = marked.parse(content);
        setTimeout(() => contentDiv.querySelectorAll('pre code').forEach(b => Prism.highlightElement(b)), 10);
    } else { 
        if (currentAttachedImage) {
            const img = document.createElement('img');
            img.src = `data:${currentAttachedImage.mimeType};base64,${currentAttachedImage.data}`;
            img.style.maxWidth = '100%';
            img.style.borderRadius = '8px';
            img.style.marginBottom = '8px';
            img.style.display = 'block';
            contentDiv.appendChild(img);
        }
        const textSpan = document.createElement('span');
        textSpan.textContent = content;
        contentDiv.appendChild(textSpan);
    }
    msgDiv.appendChild(contentDiv);
    chatHistory.appendChild(msgDiv);
    scrollToBottom();
    return msgDiv;
}

function appendToolCall(msgDiv, toolName, args) {
    const toolDiv = document.createElement('div');
    toolDiv.className = 'tool-call';
    toolDiv.innerHTML = `<strong>🛠️ ${toolName}</strong><br><span style="opacity:0.7;font-size:0.9em;">${JSON.stringify(args).substring(0,60)}...</span>`;
    msgDiv.querySelector('.message-content').appendChild(toolDiv);
    scrollToBottom();
    return toolDiv;
}

function markToolSuccess(toolDiv) {
    const span = document.createElement('span');
    span.className = 'tool-success';
    span.innerHTML = `✓ Done`;
    toolDiv.appendChild(span);
    scrollToBottom();
}

function scrollToBottom() { chatHistory.scrollTop = chatHistory.scrollHeight; }

async function handleSend() {
    const text = chatInput.value.trim();
    if (!text && queuedMessages.length === 0) return;

    if (!currentAiModel) {
        alert("Please map a Gemini Key in Settings first.");
        if (window.innerWidth <= 768) { openSidebar(); settingsContent.classList.add('active'); }
        return;
    }

    if (isProcessing) {
        queuedMessages.push(text);
        appendMessageOnly('user', text);
        addMessageToCurrent('user', text);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        stopGeneration();
        return;
    }

    setProcessingState(true);
    requestWakeLock();
    let messageToSend = text;
    let imageDataToSend = currentAttachedImage;

    if (text || currentAttachedImage) {
        appendMessageOnly('user', text);
        addMessageToCurrent('user', text);
        currentAttachedImage = null;
        imagePreviewContainer.style.display = 'none';
        imageInput.value = '';
    } else if (queuedMessages.length > 0) {
        messageToSend = queuedMessages.join('\n');
        queuedMessages = [];
    }
    
    chatInput.value = '';
    chatInput.style.height = 'auto';

    const loadingDiv = document.createElement('div');
    loadingDiv.className = `message ai thinking-msg`;
    loadingDiv.innerHTML = `<div class="message-content" style="opacity: 0.8; font-style: italic;">GitChat AI is thinking...</div>`;
    chatHistory.appendChild(loadingDiv);

    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) { loadingDiv.remove(); return; }
    const model = mapModelName(chat.model || chatModelSelect.value);
    const provider = getProvider(model);

    if (provider !== 'google') {
        await callOpenAICompatibleModel(provider, model, messageToSend, imageDataToSend, loadingDiv);
        return;
    }

    const session = getChatSession();
    currentAbortController = new AbortController();

    try {
        const parts = [{ text: messageToSend }];
        if (imageDataToSend) {
            parts.unshift({ inlineData: { mimeType: imageDataToSend.mimeType, data: imageDataToSend.data } });
        }

        let aiMsgNode = null;
        let toolDepth = 0;
        const MAX_TOOL_DEPTH = 35;
        let hasEdited = false;
        let currentParts = parts;
        let searchOnlyStreak = 0; // consecutive rounds with no patch/write
        
        // Normalize call signature: strip quotes/spaces so slight variations register as duplicates
        const normalizeArg = (v) => String(v).toLowerCase().replace(/[\'"\s]/g, '');
        const makeSignature = (name, args) => name + '-' + Object.values(args || {}).map(normalizeArg).join('|');
        const toolHistory = new Map(); // signature -> call count
        const SEARCH_TOOLS = new Set(['search_code','grep_search','list_files','get_repo_map','semantic_search','recall_memories']);
        const EDIT_TOOLS = new Set(['patch_file','patch_file_multi','write_file']);

        while (true) {
            if (currentAbortController.signal.aborted) break;
            if (toolDepth >= MAX_TOOL_DEPTH) {
                appendMessageOnly('system', `⛔ Max tool depth (${MAX_TOOL_DEPTH}) reached without completing the task. Please clarify what you need or try a more targeted approach.`);
                break;
            }

            let result, response;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount <= maxRetries) {
                try {
                    result = await session.sendMessage(currentParts, { signal: currentAbortController.signal });
                    response = result.response;
                    break;
                } catch (err) {
                    if (retryCount < maxRetries && (err.message?.includes('fetch') || err.message?.includes('429') || err.message?.includes('503'))) {
                        retryCount++;
                        const delay = retryCount * 2000;
                        console.warn(`Gemini fetch error, retrying in ${delay}ms... (Attempt ${retryCount}/${maxRetries})`);
                        await new Promise(r => setTimeout(r, delay));
                    } else {
                        throw err;
                    }
                }
            }
            
            const textResponse = response.text();
            const functionCalls = response.functionCalls();

            if (textResponse && textResponse.trim()) {
                loadingDiv.remove();
                if (!aiMsgNode) {
                    aiMsgNode = appendMessageOnly('ai', textResponse);
                } else {
                    const contentDiv = aiMsgNode.querySelector('.message-content');
                    contentDiv.innerHTML += marked.parse(textResponse);
                }
                addMessageToCurrent('ai', textResponse);
            }

            if (!functionCalls || functionCalls.length === 0) break;

            // Track whether this round has any edit tools
            const roundHasEdit = functionCalls.some(c => EDIT_TOOLS.has(c.name));
            const roundIsSearchOnly = functionCalls.every(c => SEARCH_TOOLS.has(c.name));
            if (roundHasEdit) { hasEdited = true; searchOnlyStreak = 0; }
            else if (roundIsSearchOnly) { searchOnlyStreak++; }

            toolDepth++;
            loadingDiv.remove();
            if (!aiMsgNode || !aiMsgNode.classList.contains('ai') || aiMsgNode.innerHTML.includes('thinking')) {
                aiMsgNode = appendMessageOnly('ai', "Gathering data...");
            }

            const toolPromises = functionCalls.map(async (call, index) => {
                if (currentAbortController.signal.aborted) return null;
                const toolDiv = appendToolCall(aiMsgNode, call.name, call.args);
                
                const sig = makeSignature(call.name, call.args);
                const sigCount = toolHistory.get(sig) || 0;
                let resOutput;
                
                // Block exact/near-duplicate calls (allow get_build_status repeat)
                if (call.name !== 'get_build_status' && sigCount >= 1) {
                    resOutput = `⛔ DUPLICATE CALL BLOCKED: You already called ${call.name} with these (or near-identical) arguments. Repeating it will not help. Try a completely different approach: use 'grep_search' on a specific file, or use 'patch_file' with your best guess.`;
                } else {
                    toolHistory.set(sig, sigCount + 1);
                    if (EDIT_TOOLS.has(call.name)) hasEdited = true;
                    resOutput = toolsMap[call.name] ? await toolsMap[call.name](call.args) : `Error: Unknown tool '${call.name}'`;
                }
                
                markToolSuccess(toolDiv);

                let prunedResult = resOutput;
                if (typeof resOutput === 'string' && resOutput.length > 5000) {
                    prunedResult = `[LARGE CONTENT PRUNED - ${resOutput.length} chars]. Content starts:\n${resOutput.substring(0, 600)}...\n\n💡 Use view_file with a targeted line range, or grep_search to find specific content.`;
                }
                
                // Escalating nudges — only add to first tool result per round
                if (index === 0) {
                    if (toolDepth === 8 && !hasEdited) {
                        prunedResult += `\n\n🟡 SYSTEM NUDGE (Turn ${toolDepth}): You've been exploring for a while. What is your plan? Name the file and line range you intend to patch.`;
                    } else if (toolDepth === 15 && !hasEdited) {
                        prunedResult += `\n\n🟠 SYSTEM NUDGE (Turn ${toolDepth}): STOP SEARCHING. You have enough context. Make your best guess and call patch_file NOW. You can fix mistakes afterward.`;
                    } else if (toolDepth === 22 && !hasEdited) {
                        prunedResult += `\n\n🔴 SYSTEM ALERT (Turn ${toolDepth}): You are in a search loop. DO NOT call any search tool again. Either: (1) call patch_file with your best attempt, or (2) respond with a text message explaining what you're stuck on.`;
                    }
                    
                    // Hard block: too many search-only rounds
                    if (searchOnlyStreak >= 6 && !hasEdited) {
                        prunedResult += `\n\n🚫 HARD BLOCK: You have made ${searchOnlyStreak} consecutive search-only rounds with no edits. SEARCHING IS NOW BLOCKED. You must either call patch_file/patch_file_multi OR stop and ask the user for help. If you search again, explain why in a text response first.`;
                    }
                    
                    // Force-stop approaching max depth
                    if (toolDepth >= MAX_TOOL_DEPTH - 5 && !hasEdited) {
                        prunedResult += `\n\n🚨 CRITICAL (Turn ${toolDepth}/${MAX_TOOL_DEPTH}): Approaching turn limit. Make an edit NOW or the session will end without completing the task.`;
                    }
                }

                return { functionResponse: { name: call.name, response: { name: call.name, content: prunedResult } } };
            });

            const toolResults = await Promise.all(toolPromises);
            currentParts = toolResults.filter(r => r !== null);
        }

    } catch (e) {
        loadingDiv.remove();
        if (e.name === 'AbortError' || (e.message && e.message.includes('abort'))) {
            appendMessageOnly('system', 'Generation stopped.');
        } else {
            console.error("Full AI Error:", e);
            appendMessageOnly('ai', e.message);
        }
    } finally {
        releaseWakeLock();
        currentAbortController = null;
        setProcessingState(false);
        if (aiMsgNode) {
            const finalContent = aiMsgNode.querySelector('.message-content').innerText;
            sendCompletionNotification(finalContent);
        }
        if (queuedMessages.length > 0) handleSend();
    }
}

// --- Build Status ---
function startBuildStatusPolling() {
    if (buildStatusCheckInterval) clearInterval(buildStatusCheckInterval);
    updateBuildStatus();
    buildStatusCheckInterval = setInterval(updateBuildStatus, 30000); // Check every 30s
}

async function updateBuildStatus() {
    const statusEl = document.getElementById('build-status-indicator');
    const statusText = document.getElementById('build-status-text');
    if (!githubHeaders || !currentRepo) return;

    try {
        // Fetch latest commit/workflow checks
        const res = await fetch(`https://api.github.com/repos/${currentRepo}/commits/${currentBranch}/check-runs`, { headers: githubHeaders });
        if (res.ok) {
            const data = await res.json();
            const lastCheck = data.check_runs[0];
            if (!lastCheck) return;

            if (lastCheck.status === 'in_progress') {
                statusEl.className = 'build-status building';
                statusText.textContent = 'Building...';
            } else if (lastCheck.conclusion === 'success') {
                statusEl.className = 'build-status';
                statusText.textContent = 'Live';
            } else if (lastCheck.conclusion === 'failure') {
                statusEl.className = 'build-status error';
                statusText.textContent = 'Failed';
            }
        }
    } catch (e) { console.log("Build status check failed"); }
}

async function callOpenAICompatibleModel(provider, model, message, image, loading) {
    const key = provider === 'deepseek' ? deepseekKeyInput.value.trim() : minimaxKeyInput.value.trim();
    const endpoint = provider === 'deepseek' ? "https://api.deepseek.com/v1/chat/completions" : "https://api.minimax.chat/v1/text/chatcompletion_v2";
    
    if (!key) { alert(`Please enter your ${provider} key in settings.`); loading.remove(); setProcessingState(false); return; }

    currentAbortController = new AbortController();
    const chat = chats.find(c => c.id === currentChatId);
    
    const messages = [];
    messages.push({ role: 'system', content: `You are GitChat AI, an Elite Autonomous Software Engineer. 
GOAL: Ship working code as fast as possible. 
CRITICAL: BIAS FOR ACTION. If you search more than 7 times without coding, you are over-analyzing. STOP and ask for help.
CRITICAL: Once you find a file that looks relevant, STOP searching and START coding with 'patch_file'.
CRITICAL: Avoid getting stuck in tool loops.
CRITICAL: When you perform a "System Upgrade" (improving GitChat's own code), increment the version number in 'index.html'.
CRITICAL: When updating code, provide the FULL file to 'write_file'. Use 'view_file' for exploration.` });

    // Add history
    chat.messages.forEach(m => {
        messages.push({
            role: m.role === 'ai' ? 'assistant' : 'user',
            content: m.content
        });
    });
    
    // Add current message
    messages.push({ role: 'user', content: message });
    
    const tools = [
        { type: "function", function: { name: "line_count", description: "FAST: Get line count + size without reading content. Use before view_file.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
        { type: "function", function: { name: "list_files", description: "List files in a directory.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
        { type: "function", function: { name: "get_repo_map", description: "Get the recursive file tree." } },
        { type: "function", function: { name: "grep_search", description: "Find lines matching a pattern in a file. Use to locate line numbers before view_file.", parameters: { type: "object", properties: { path: { type: "string" }, query: { type: "string" } }, required: ["path", "query"] } } },
        { type: "function", function: { name: "view_file", description: "View specific lines. Always provide start_line and end_line.", parameters: { type: "object", properties: { path: { type: "string" }, start_line: { type: "integer" }, end_line: { type: "integer" } }, required: ["path"] } } },
        { type: "function", function: { name: "patch_file", description: "Surgical single replacement.", parameters: { type: "object", properties: { path: { type: "string" }, search: { type: "string" }, replace: { type: "string" }, commit_message: { type: "string" } }, required: ["path", "search", "replace"] } } },
        { type: "function", function: { name: "patch_file_multi", description: "PREFERRED: Multiple replacements in one commit.", parameters: { type: "object", properties: { path: { type: "string" }, patches: { type: "array", items: { type: "object", properties: { search: { type: "string" }, replace: { type: "string" } }, required: ["search", "replace"] } }, commit_message: { type: "string" } }, required: ["path", "patches"] } } },
        { type: "function", function: { name: "get_build_status", description: "Check CI/Build logs." } },
        { type: "function", function: { name: "run_lighthouse", description: "Audit live site performance." } },
        { type: "function", function: { name: "semantic_search", description: "Find code by meaning using Supabase.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
        { type: "function", function: { name: "remember_this", description: "Save user preferences.", parameters: { type: "object", properties: { fact: { type: "string" }, category: { type: "string" } }, required: ["fact"] } } },
        { type: "function", function: { name: "recall_memories", description: "Recall user history.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
        { type: "function", function: { name: "search_code", description: "Search for specific code strings across the repo.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
        { type: "function", function: { name: "read_file", description: "Read ENTIRE file. Slow on large files. Prefer view_file+grep_search.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
        { type: "function", function: { name: "write_file", description: "Full file overwrite. Only for new/tiny files.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, commit_message: { type: "string" } }, required: ["path", "content", "commit_message"] } } }
    ];

    if (localTerminalEnabled) {
        tools.push({
            type: "function",
            function: {
                name: "run_terminal_command",
                description: "Run a command in the user's local terminal.",
                parameters: {
                    type: "object",
                    properties: {
                        command: { type: "string" },
                        cwd: { type: "string" }
                    },
                    required: ["command"]
                }
            }
        });
    }


    if (localTerminalEnabled) {
        messages[0].content += "\n\nLOCAL TERMINAL ACTIVE. Use 'run_terminal_command' to run shell commands or tests locally.";
    }

    requestWakeLock();
    try {
        let toolHistory = new Map();
        let toolDepth = 0;
        const MAX_TOOL_DEPTH = 35;
        let hasEdited = false;
        let aiMsgNode = null;
        let searchOnlyStreak = 0;
        
        const normalizeArg = (v) => String(v).toLowerCase().replace(/[\'"\s]/g, '');
        const makeSignature = (name, args) => name + '-' + Object.values(args || {}).map(normalizeArg).join('|');
        const SEARCH_TOOLS = new Set(['search_code','grep_search','list_files','get_repo_map','semantic_search','recall_memories']);
        const EDIT_TOOLS = new Set(['patch_file','patch_file_multi','write_file']);

        while(true) {
            if (currentAbortController.signal.aborted) break;
            if (toolDepth >= MAX_TOOL_DEPTH) {
                appendMessageOnly('system', "Maximum tool depth reached. Stopping to prevent loop.");
                break;
            }

            let res;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount <= maxRetries) {
                try {
                    res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                        body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
                        signal: currentAbortController.signal
                    });
                    if (res.ok) break;
                    if (res.status === 429 || res.status >= 500) {
                        throw new Error(`Status ${res.status}`);
                    } else {
                        break;
                    }
                } catch (err) {
                    if (retryCount < maxRetries) {
                        retryCount++;
                        const delay = retryCount * 2000;
                        console.warn(`${provider} error, retrying in ${delay}ms... (Attempt ${retryCount}/${maxRetries})`);
                        await new Promise(r => setTimeout(r, delay));
                    } else {
                        throw err;
                    }
                }
            }

            if (!res.ok) throw new Error(`${provider} Error ${res.status}`);
            const data = await res.json();
            const choice = data.choices[0];
            const aiMsg = choice.message;
            messages.push(aiMsg);

            if (aiMsg.content) {
                loading.remove();
                appendMessageOnly('ai', aiMsg.content);
                addMessageToCurrent('ai', aiMsg.content);
            }

            if (!aiMsg.tool_calls || aiMsg.tool_calls.length === 0) break;

            loading.remove();
            aiMsgNode = chatHistory.lastElementChild;
            if (!aiMsgNode || !aiMsgNode.classList.contains('ai')) aiMsgNode = appendMessageOnly('ai', "(Analyzing repository...)");

            const toolPromises = aiMsg.tool_calls.map(async (call, index) => {
                const toolName = call.function.name;
                const toolArgs = call.function.arguments;
                const toolDiv = appendToolCall(aiMsgNode, toolName, JSON.parse(toolArgs));
                
                const callSignature = `${toolName}-${toolArgs}`;
                let output;
                
                if (toolName !== 'get_build_status' && toolHistory.has(callSignature)) {
                    output = "SYSTEM WARNING: You have already called this exact tool with identical arguments recently. You are stuck in a loop. Try a different approach or stop and ask the user.";
                } else {
                    toolHistory.add(callSignature);
                    if (toolName === 'write_file' || toolName === 'patch_file') hasEditted = true;
                    output = toolsMap[toolName] ? await toolsMap[toolName](JSON.parse(toolArgs)) : "Error";
                }
                
                markToolSuccess(toolDiv);
                
                const prunedOutput = typeof output === 'string' && output.length > 5000 
                    ? `[LARGE CONTENT PRUNED - ${output.length} characters]. Partial view: ${output.substring(0, 500)}...` 
                    : output;
                
                let finalContent = prunedOutput;
                if (toolDepth === 15 && !hasEditted && index === 0) {
                    finalContent += "\n\nSYSTEM NUDGE: You are over-exploring. You have gathered enough data. Form a hypothesis NOW and use 'patch_file' or 'write_file'. Do not make another search call.";
                }
                    
                return { role: 'tool', tool_call_id: call.id, content: finalContent };
            });

            const toolResults = await Promise.all(toolPromises);
            messages.push(...toolResults);
            toolDepth++;
            
            chatHistory.appendChild(loading);
        }
    } catch (e) {
        loading.remove();
        appendMessageOnly('ai', `Error: ${e.message}`);
    } finally {
        loading.remove();
        setProcessingState(false);
        releaseWakeLock();
        if (aiMsgNode) {
            sendCompletionNotification("Task finished.");
        }
    }
}

document.addEventListener('DOMContentLoaded', init);

function initAuth() {
    const user = window.netlifyIdentity.currentUser();
    updateAuthUI(user);

    window.netlifyIdentity.on('login', user => {
        window.netlifyIdentity.close();
        updateAuthUI(user);
    });

    window.netlifyIdentity.on('logout', () => {
        updateAuthUI(null);
    });
}

function updateAuthUI(user) {
    if (user) {
        authBtn.textContent = 'Logout';
        userInfo.style.display = 'flex';
        userEmailText.textContent = user.email;
        // Reinforce settings on login
        loadSettings();
    } else {
        authBtn.textContent = 'Login';
        userInfo.style.display = 'none';
    }
}
