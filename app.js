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

// Chat State
let chats = [];
let currentChatId = null;
const fileCache = new Map();
let chatSessions = {};

// Initialize
async function init() {
    // Safety Reset: Force page back to top transform on load
    document.getElementById('pull-to-refresh').style.transform = 'translateY(0)';
    document.getElementById('app').style.transform = 'translateY(0)';
    
    await loadSettings();
    loadChats();
    setupEventListeners();
    initAuth();
    marked.setOptions({ breaks: true, gfm: true });
    startBuildStatusPolling();
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

    window.addEventListener('touchstart', (e) => {
        if (chatHistory.scrollTop === 0) {
            touchStart = e.touches[0].pageY;
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        const touchCurrent = e.touches[0].pageY;
        if (chatHistory.scrollTop === 0 && touchCurrent > touchStart) {
            pullDistance = Math.min((touchCurrent - touchStart) * 0.5, 120);
            pullToRefreshEl.style.transform = `translateY(${pullDistance}px)`;
            appEl.style.transform = `translateY(${pullDistance}px)`;
            if (pullDistance >= PULL_THRESHOLD) {
                pullToRefreshEl.querySelector('span').textContent = "Release to refresh...";
            } else {
                pullToRefreshEl.querySelector('span').textContent = "Pull to refresh...";
            }
        }
    }, { passive: true });

    window.addEventListener('touchend', () => {
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
    }, { passive: true });
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

function saveChats() {
    localStorage.setItem('gitchat_sessions', JSON.stringify(chats));
    if (syncEnabled) pushChatsToCloud(); // <-- Added this line
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
        } catch (err) { console.log("WakeLock failed"); }
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().then(() => wakeLock = null);
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
                localStorage.setItem('gitchat_gemini_key', geminiKeyInput.value);
                localStorage.setItem('gitchat_github_token', githubTokenInput.value);
                localStorage.setItem('gitchat_github_branch', githubBranchInput.value);
                localStorage.setItem('gitchat_deepseek_key', deepseekKeyInput.value);
                localStorage.setItem('gitchat_minimax_key', minimaxKeyInput.value);
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
        minimax_key: minimaxKeyInput.value.trim()
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

async function ghReadFile(path) {
    if (fileCache.has(path)) return fileCache.get(path);
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
        const map = data.tree
            .map(item => `${item.type === 'tree' ? '📁' : '📄'} ${item.path}`)
            .join('\n') || "Empty repository.";
        
        try { localStorage.setItem(cacheKey, map); } catch(e) { console.warn("Repo map too large for localStorage"); }
        return map;
    } catch (e) { return `Error: ${e.message}`; }
}

async function ghSearchCode(query) {
    try {
        const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}+repo:${currentRepo}`;
        const res = await fetch(url, { headers: githubHeaders });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (data.items.length === 0) return "No results found.";
        return data.items.slice(0, 15).map(item => `📄 ${item.path}`).join('\n');
    } catch (e) { return `Error: ${e.message}`; }
}

async function ghPatchFile(path, search, replace, commit_message) {
    try {
        const original = await ghReadFile(path);
        if (original.startsWith("Error:")) return original;
        
        if (!original.includes(search)) {
            return `Error: Did not find the exact 'search' text in ${path}. Please ensure whitespace/indentation are identical to what you read.`;
        }
        
        const updated = original.replace(search, replace);
        return await ghWriteFile(path, updated, commit_message || `Patch ${path}`);
    } catch (e) { return `Error patching: ${e.message}`; }
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

async function ghWriteFile(path, content, commit_message) {
    try {
        let sha = undefined;
        // 1. Get current file SHA if it exists
        const getRes = await fetch(`https://api.github.com/repos/${currentRepo}/contents/${path}?ref=${currentBranch}`, { headers: githubHeaders });
        if (getRes.ok) {
            const getData = await getRes.json();
            sha = getData.sha;
        }

        // 2. Prepare content - Robust Base64 for UTF-8
        const bytes = new TextEncoder().encode(content);
        let binaryString = "";
        for (let i = 0; i < bytes.byteLength; i++) {
            binaryString += String.fromCharCode(bytes[i]);
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
            throw new Error(`GitHub Error ${putRes.status}: ${errData.message || res.statusText}`);
        }

        return `Successfully wrote to ${path}! Changes pushed to branch '${currentBranch}'.`;
    } catch (e) { 
        console.error("Write File Error:", e);
        return `Error writing file: ${e.message}`; 
    }
}

const toolsMap = { 
    list_files: (args) => ghListFiles(args.path || ""), 
    read_file: (args) => ghReadFile(args.path), 
    write_file: (args) => {
        fileCache.delete(args.path); // Bust cache on write
        return ghWriteFile(args.path, args.content, args.commit_message);
    },
    patch_file: (args) => {
        fileCache.delete(args.path); // Bust cache on write
        return ghPatchFile(args.path, args.search, args.replace, args.commit_message);
    },
    get_repo_map: () => ghGetRepoMap(),
    search_code: (args) => ghSearchCode(args.query),
    get_build_status: () => ghGetBuildStatus()
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

    currentAiModel = genAI.getGenerativeModel({ 
        model: modelName, 
        safetySettings,
        tools: [{
            functionDeclarations: [
                { name: "get_repo_map", description: "Get the entire repository structure recursively. Use this first for large repos." },
                { name: "search_code", description: "Search for strings/symbols across all files.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
                { name: "patch_file", description: "Surgical update. Provide a block of code to search for and what to replace it with. Much faster than write_file for large files.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" }, search: { type: "STRING" }, replace: { type: "STRING" }, commit_message: { type: "STRING" } }, required: ["path", "search", "replace"] } },
                { name: "read_file", description: "Read a file. Results are cached per session.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" } }, required: ["path"] } },
                { name: "write_file", description: "Full file overwrite. Use patch_file instead if making small changes.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" }, content: { type: "STRING" }, commit_message: { type: "STRING" } }, required: ["path", "content", "commit_message"] } },
                { name: "get_build_status", description: "Check current GitHub Actions/Netlify build status and error logs." }
            ]
        }],
        systemInstruction: `You are GitChat AI, a Senior Autonomous Engineer. 
Repo: '${currentRepo}' | Branch: '${currentBranch}'.
- GOAL: Operate with high precision and speed.
- PATCHING: Prefer 'patch_file' over 'write_file' for existing files—it is 10x faster and safer.
- BUILD LOOP: If you push code, check 'get_build_status' after 30-60s. If it fails, READ the logs and fix it immediately without being asked.
- EXPLORATION: Start with 'get_repo_map' to see everything.
- CACHING: You don't need to re-read files you've already seen this session.`
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

        let result = await session.sendMessageStream(parts, { signal: currentAbortController.signal });
        let fullResponseText = "";
        let aiMsgNode = null;

        while (true) {
            if (currentAbortController.signal.aborted) break;

            // Stream handler
            for await (const chunk of result.stream) {
                if (currentAbortController.signal.aborted) break;
                loadingDiv.remove();
                
                const chunkText = chunk.text();
                fullResponseText += chunkText;
                
                if (!aiMsgNode) aiMsgNode = appendMessageOnly('ai', "");
                const contentDiv = aiMsgNode.querySelector('.message-content');
                contentDiv.innerHTML = marked.parse(fullResponseText);
                
                // Speculative Pre-fetch: Look for potential filenames in the stream
                const fileMatches = chunkText.match(/[a-zA-Z0-9_\-\.\/]+\.(js|py|html|css|json|md|txt|ts|jsx|tsx)/g);
                if (fileMatches) {
                    fileMatches.forEach(path => {
                        if (!fileCache.has(path) && path.length > 4) {
                            console.log("🚀 Speculative pre-fetch:", path);
                            ghReadFile(path); // Fire and forget into cache
                        }
                    });
                }
                
                scrollToBottom();
            }

            const response = await result.response;
            const functionCalls = response.functionCalls();
            
            if (!functionCalls || functionCalls.length === 0) break;
            
            if (!aiMsgNode) aiMsgNode = appendMessageOnly('ai', "Gathering data...");
            
            const toolPromises = functionCalls.map(async (call) => {
                if (currentAbortController.signal.aborted) return null;
                const toolDiv = appendToolCall(aiMsgNode, call.name, call.args);
                const resOutput = toolsMap[call.name] ? await toolsMap[call.name](call.args) : "Error";
                markToolSuccess(toolDiv);
                return { functionResponse: { name: call.name, response: { name: call.name, content: resOutput } } };
            });

            const toolResults = await Promise.all(toolPromises);
            const functionResponses = toolResults.filter(r => r !== null);

            if (currentAbortController.signal.aborted) break;

            chatHistory.appendChild(loadingDiv);
            result = await session.sendMessageStream(functionResponses, { signal: currentAbortController.signal });
            fullResponseText = ""; 
            aiMsgNode = null; // Reset for next stream part
        }

        loadingDiv.remove();
        if (fullResponseText && !currentAbortController.signal.aborted) {
            addMessageToCurrent('ai', fullResponseText);
            // Ensure final highlight
            if (aiMsgNode) aiMsgNode.querySelectorAll('pre code').forEach(b => Prism.highlightElement(b));
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
    // Add system instruction
    messages.push({ role: 'system', content: `You are GitChat AI, an expert autonomous software engineer. 
You have direct access to the user\'s GitHub repository \'${currentRepo}\' on branch \'${currentBranch}\'. 
Use tools to read/write files and explain your actions. 
CRITICAL: When updating code, ensure you provide the FULL content of the file to \'write_file\'.` });

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
        { type: "function", function: { name: "get_repo_map", description: "Get the recursive file tree." } },
        { type: "function", function: { name: "patch_file", description: "Surgical block-replacement.", parameters: { type: "object", properties: { path: { type: "string" }, search: { type: "string" }, replace: { type: "string" }, commit_message: { type: "string" } }, required: ["path", "search", "replace"] } } },
        { type: "function", function: { name: "get_build_status", description: "Check CI/Build logs." } },
        { type: "function", function: { name: "search_code", description: "Search for specific code strings across the repo.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
        { type: "function", function: { name: "read_file", description: "Read file content", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
        { type: "function", function: { name: "write_file", description: "Full file overwrite.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, commit_message: { type: "string" } }, required: ["path", "content", "commit_message"] } } }
    ];

    try {
        while(true) {
            if (currentAbortController.signal.aborted) break;
            
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
                signal: currentAbortController.signal
            });

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
            let aiMsgNode = chatHistory.lastElementChild;
            if (!aiMsgNode || !aiMsgNode.classList.contains('ai')) aiMsgNode = appendMessageOnly('ai', "(Analyzing repository...)");

            const toolPromises = aiMsg.tool_calls.map(async (call) => {
                const toolDiv = appendToolCall(aiMsgNode, call.function.name, JSON.parse(call.function.arguments));
                const output = toolsMap[call.function.name] ? await toolsMap[call.function.name](JSON.parse(call.function.arguments)) : "Error";
                markToolSuccess(toolDiv);
                return { role: 'tool', tool_call_id: call.id, content: output };
            });

            const toolResults = await Promise.all(toolPromises);
            messages.push(...toolResults);
            
            chatHistory.appendChild(loading);
        }
    } catch (e) {
        loading.remove();
        appendMessageOnly('ai', `Error: ${e.message}`);
    } finally {
        loading.remove();
        setProcessingState(false);
        releaseWakeLock();
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
