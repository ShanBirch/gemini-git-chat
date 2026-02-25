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
let chatSessions = {};

// Initialize
async function init() {
    await loadSettings();
    loadChats();
    setupEventListeners();
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
            window.location.reload();
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
    // 1. Check URL for sync params
    const params = new URLSearchParams(window.location.search);
    if (params.has('s') && params.has('k')) {
        supabaseUrlInput.value = atob(params.get('s'));
        supabaseKeyInput.value = atob(params.get('k'));
        await initSupabase(true); // silent init
    } else {
        // 2. Load from localStorage
        supabaseUrlInput.value = localStorage.getItem('gitchat_supabase_url') || '';
        supabaseKeyInput.value = localStorage.getItem('gitchat_supabase_key') || '';
        if (supabaseUrlInput.value && supabaseKeyInput.value) await initSupabase(true);
    }

    geminiKeyInput.value = localStorage.getItem('gitchat_gemini_key') || '';
    githubTokenInput.value = localStorage.getItem('gitchat_github_token') || '';
    deepseekKeyInput.value = localStorage.getItem('gitchat_deepseek_key') || '';
    minimaxKeyInput.value = localStorage.getItem('gitchat_minimax_key') || '';
    const savedRepo = localStorage.getItem('gitchat_github_repo') || '';
    githubBranchInput.value = localStorage.getItem('gitchat_github_branch') || 'main';
    
    if (geminiKeyInput.value) setupAI();
    if (githubTokenInput.value) {
        fetchUserRepos(savedRepo);
        testGitHubConnection();
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
        const headers = { "Accept": "application/vnd.github.v3+json", "Authorization": `token ${token}` };
        const res = await fetch(`https://api.github.com/user/repos?sort=updated&per_page=100`, { headers });
        if (res.ok) {
            const repos = await res.json();
            githubRepoSelect.innerHTML = '';
            
            // Add current selected repo if it's not in the top 100 updated
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
            githubRepoSelect.innerHTML = '<option value="">Error fetching repos</option>';
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
        return data.map(item => `${item.type === 'dir' ? '📁' : '📄'} ${item.path}`).join('\n') || "Empty directory.";
    } catch (e) { return `Error: ${e.message}`; }
}

async function ghReadFile(path) {
    try {
        const url = `https://api.github.com/repos/${currentRepo}/contents/${path}?ref=${currentBranch}`;
        const res = await fetch(url, { headers: githubHeaders });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (data.type !== 'file') return `Not a file.`;
        const binaryString = atob(data.content.replace(/\s/g, ''));
        const bytes = new Uint8Array(binaryString.length);
        for (let i=0; i<binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        return new TextDecoder('utf-8').decode(bytes);
    } catch (e) { return `Error: ${e.message}`; }
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

const toolsMap = { list_files: (args) => ghListFiles(args.path || ""), read_file: (args) => ghReadFile(args.path), write_file: (args) => ghWriteFile(args.path, args.content, args.commit_message) };

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
                { name: "list_files", description: "List files in a directory of the standard connected GitHub repository.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" } } } },
                { name: "read_file", description: "Read the full content of a specific file from the repository.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" } }, required: ["path"] } },
                { name: "write_file", description: "Update or create a file in the repository.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" }, content: { type: "STRING" }, commit_message: { type: "STRING" } }, required: ["path", "content", "commit_message"] } }
            ]
        }],
        systemInstruction: `You are GitChat AI, an expert autonomous software engineer. 
Your current model is ${modelName}. 
You have direct access to the user\'s GitHub repository \'${currentRepo}\' on branch \'${currentBranch}\'. 
Use tools to read/write files and explain your actions. 
CRITICAL: When updating code, ensure you provide the FULL content of the file to \'write_file\'. 
If a tool fails, read the error message carefully and explain the exact GitHub error to the user.`
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
        // Queue the message, print to UI, and interrupt current flow
        queuedMessages.push(text);
        appendMessageOnly('user', text);
        addMessageToCurrent('user', text);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        stopGeneration();
        return;
    }

    // Processing start
    setProcessingState(true);
    requestWakeLock();
    let messageToSend = text;
    let imageDataToSend = currentAttachedImage;

    if (text || currentAttachedImage) {
        appendMessageOnly('user', text);
        addMessageToCurrent('user', text);
        // Clear preview immediately
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
            parts.unshift({
                inlineData: {
                    mimeType: imageDataToSend.mimeType,
                    data: imageDataToSend.data
                }
            });
        }

        let result = await session.sendMessage(parts, { signal: currentAbortController.signal });
        let fullResponseText = "";
        
        while (true) {
            if (currentAbortController.signal.aborted) break;

            const response = result.response;
            const functionCalls = response.functionCalls();
            if (response.text() && response.text().trim() !== "") fullResponseText += response.text() + "\n";
            if (!functionCalls || functionCalls.length === 0) break;
            
            loadingDiv.remove();
            let aiMsgNode = chatHistory.lastElementChild;
            if (!aiMsgNode || !aiMsgNode.classList.contains('ai') || aiMsgNode.innerHTML.includes('Thinking')) {
                 aiMsgNode = appendMessageOnly('ai', fullResponseText || "Analyzing repository...");
            }
            
            const functionResponses = [];

            for (const call of functionCalls) {
                if (currentAbortController.signal.aborted) break;
                const toolDiv = appendToolCall(aiMsgNode, call.name, call.args);
                const resOutput = toolsMap[call.name] ? await toolsMap[call.name](call.args) : "Error";
                markToolSuccess(toolDiv);
                functionResponses.push({ functionResponse: { name: call.name, response: { name: call.name, content: resOutput } } });
            }

            if (currentAbortController.signal.aborted) break;

            chatHistory.appendChild(loadingDiv);
            result = await session.sendMessage(functionResponses, { signal: currentAbortController.signal });
            fullResponseText = ""; 
        }

        loadingDiv.remove();
        if (fullResponseText && !currentAbortController.signal.aborted) {
            appendMessageOnly('ai', fullResponseText);
            addMessageToCurrent('ai', fullResponseText);
        }

    } catch (e) {
        loadingDiv.remove();
        if (e.name === 'AbortError' || (e.message && e.message.includes('abort'))) {
            appendMessageOnly('system', 'Generation stopped.');
        } else {
            console.error("Full AI Error:", e);
            let userMsg = e.message;
            if (e.message.includes("404")) {
                const currentModelName = currentAiModel?.model || "unknown";
                userMsg = `Model Not Found (404): The ID "${currentModelName}" is not available for your key or region. \n\nTip: Google rolls out Gemini 3.1 gradually. Try switching to "Gemini 2.0 Flash" or "Gemini 1.5 Flash" in the bottom menu.`;
            }
            appendMessageOnly('ai', userMsg);
        }
    } finally {
        releaseWakeLock();
        currentAbortController = null;
        setProcessingState(false);
        chatInput.focus();
        if (queuedMessages.length > 0) {
            handleSend(); // Trigger next queue if any
        }
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
        { type: "function", function: { name: "list_files", description: "List files in a directory", parameters: { type: "object", properties: { path: { type: "string" } } } } },
        { type: "function", function: { name: "read_file", description: "Read file content", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
        { type: "function", function: { name: "write_file", description: "Write file content", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, commit_message: { type: "string" } }, required: ["path", "content", "commit_message"] } } }
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

            for (const call of aiMsg.tool_calls) {
                const toolDiv = appendToolCall(aiMsgNode, call.function.name, JSON.parse(call.function.arguments));
                const output = toolsMap[call.function.name] ? await toolsMap[call.function.name](JSON.parse(call.function.arguments)) : "Error";
                markToolSuccess(toolDiv);
                messages.push({ role: 'tool', tool_call_id: call.id, content: output });
            }
            
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
