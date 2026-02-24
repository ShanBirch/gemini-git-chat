import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

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
let currentAttachedImage = null; // { mimeType: string, data: string (base64) }

// Chat State
let chats = [];
let currentChatId = null;
let chatSessions = {};

// Initialize
function init() {
    loadSettings();
    loadChats();
    setupEventListeners();
    marked.setOptions({ breaks: true, gfm: true });
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

function saveChats() { localStorage.setItem('gitchat_sessions', JSON.stringify(chats)); }

function createNewChat() {
    const newChat = { id: Date.now().toString(), title: "New Chat", messages: [], model: chatModelSelect.value, createdAt: new Date().toISOString() };
    chats.unshift(newChat);
    currentChatId = newChat.id;
    if (genAI) setupAI(); // Ensure model object exists for startChat
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
    chatModelSelect.value = chat.model || 'gemini-3-flash-preview';
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
}

// Settings Management
function loadSettings() {
    geminiKeyInput.value = localStorage.getItem('gitchat_gemini_key') || '';
    githubTokenInput.value = localStorage.getItem('gitchat_github_token') || '';
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
    settingsContent.classList.remove('active');
    setupAI();
    fetchUserRepos(githubRepoSelect.value);
    testGitHubConnection();
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
        const getRes = await fetch(`https://api.github.com/repos/${currentRepo}/contents/${path}?ref=${currentBranch}`, { headers: githubHeaders });
        if (getRes.ok) sha = (await getRes.json()).sha;
        const bytes = new TextEncoder().encode(content);
        let binaryString = "";
        for (let i=0; i<bytes.byteLength; i++) binaryString += String.fromCharCode(bytes[i]);
        const body = { message: commit_message || `Update ${path}`, content: btoa(binaryString), branch: currentBranch };
        if (sha) body.sha = sha;
        const putRes = await fetch(`https://api.github.com/repos/${currentRepo}/contents/${path}`, {
            method: 'PUT', headers: { ...githubHeaders, "Content-Type": "application/json" }, body: JSON.stringify(body)
        });
        if (!putRes.ok) throw new Error(`${putRes.status}`);
        return `Successfully wrote to ${path}!`;
    } catch (e) { return `Error: ${e.message}`; }
}

const toolsMap = { list_files: (args) => ghListFiles(args.path || ""), read_file: (args) => ghReadFile(args.path), write_file: (args) => ghWriteFile(args.path, args.content, args.commit_message) };

// --- AI Integration ---
function setupAI() {
    const key = geminiKeyInput.value.trim();
    if (!key) return;
    const chat = chats.find(c => c.id === currentChatId);
    const modelName = (chat && chat.model) || chatModelSelect.value || "gemini-3-flash-preview";
    genAI = new GoogleGenerativeAI(key);
    currentAiModel = genAI.getGenerativeModel({ 
        model: modelName, 
        tools: [{
            functionDeclarations: [
                { name: "list_files", description: "List files in a directory of the standard connected GitHub repository.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" } } } },
                { name: "read_file", description: "Read the full content of a specific file from the repository.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" } }, required: ["path"] } },
                { name: "write_file", description: "Update or create a file in the repository.", parameters: { type: "OBJECT", properties: { path: { type: "STRING" }, content: { type: "STRING" }, commit_message: { type: "STRING" } }, required: ["path", "content", "commit_message"] } }
            ]
        }],
        systemInstruction: `You are GitChat AI, an expert autonomous software engineer with direct access to the user's GitHub repository. Use tools to read/write files and explain your actions.`
    });
}

function getChatSession() {
    if (!chatSessions[currentChatId]) {
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

    const session = getChatSession();
    currentAbortController = new AbortController();

    const loadingDiv = document.createElement('div');
    loadingDiv.className = `message ai thinking-msg`;
    loadingDiv.innerHTML = `<div class="message-content" style="opacity: 0.8; font-style: italic;">GitChat AI is thinking...</div>`;
    chatHistory.appendChild(loadingDiv);

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
            // Append or update ai message node
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
            appendMessageOnly('ai', `Error: ${e.message}`);
        }
    } finally {
        currentAbortController = null;
        setProcessingState(false);
        chatInput.focus();
        if (queuedMessages.length > 0) {
            handleSend(); // Trigger next queue if any
        }
    }
}

document.addEventListener('DOMContentLoaded', init);
