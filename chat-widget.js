(function() {
    // --- Configuration ---
    const API_ENDPOINT = '/.netlify/functions/sales-bot';
    
    // --- Build DOM ---
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'pbb-chat-widget';
    
    widgetContainer.innerHTML = `
        <div id="pbb-chat-window">
            <div class="pbb-chat-header">
                <div class="pbb-user-info">
                    <div class="pbb-avatar">🌿</div>
                    <div class="pbb-status">
                        <h3>Protocol Assistant</h3>
                        <span>Online Now</span>
                    </div>
                </div>
                <button class="pbb-close" id="pbb-close-btn">✕</button>
            </div>
            
            <div class="pbb-messages" id="pbb-messages">
                <!-- Messages go here -->
            </div>
            
            <form class="pbb-input-area" id="pbb-chat-form">
                <input type="text" id="pbb-chat-input" placeholder="Ask about the Reset..." autocomplete="off">
                <button type="submit" class="pbb-send-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </form>
        </div>
        
        <div id="pbb-chat-bubble">
            <div class="pbb-chat-notification"></div>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
        </div>
    `;
    
    document.body.appendChild(widgetContainer);
    
    // --- Elements ---
    const bubble = document.getElementById('pbb-chat-bubble');
    const windowEl = document.getElementById('pbb-chat-window');
    const closeBtn = document.getElementById('pbb-close-btn');
    const form = document.getElementById('pbb-chat-form');
    const input = document.getElementById('pbb-chat-input');
    const messagesEl = document.getElementById('pbb-messages');
    const notifDot = widgetContainer.querySelector('.pbb-chat-notification');

    let history = []; // Stores conversation context for the session
    let isGenerating = false;
    
    // --- Initialization ---
    // Add Welcome Message if empty
    setTimeout(() => {
        addMessage("bot", "Hi! 👋 I'm the Protocol Assistant. Ask me anything about the 4-Week Cortisol Reset!");
    }, 1000);

    // --- Event Listeners ---
    bubble.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', toggleChat);
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isGenerating) return;

        const text = input.value.trim();
        if (!text) return;
        
        // 1. User Message
        addMessage('user', text);
        input.value = '';
        isGenerating = true;
        
        // 2. Typing Indicator
        const typingId = showTyping();
        
        // Add timeout controller for background suspension
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        
        try {
            // 3. API Call
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                signal: controller.signal,
                body: JSON.stringify({ 
                    message: text,
                    history: history 
                })
            });
            clearTimeout(timeoutId);
            
            const data = await response.json();
            removeTyping(typingId);
            isGenerating = false;
            
            if (data.reply) {
                addMessage('bot', data.reply);
                // Only push to history on success to prevent broken Gemini sequences
                history.push({ role: 'user', text: text });
                history.push({ role: 'bot', text: data.reply });
                if (history.length > 20) history = history.slice(-20);
            } else {
                addMessage('bot', "I'm having a little trouble thinking clearly. Could you ask that again?");
            }
            
        } catch (err) {
            clearTimeout(timeoutId);
            console.error(err);
            removeTyping(typingId);
            isGenerating = false;
            addMessage('bot', "Connection paused. Please try asking again! 🌿");
        }
    });
    
    // --- Functions ---
    function toggleChat() {
        windowEl.classList.toggle('active');
        if (windowEl.classList.contains('active')) {
            notifDot.style.display = 'none'; // Clear notification
            input.focus();
        }
    }
    
    function addMessage(role, text) {
        const div = document.createElement('div');
        div.className = `pbb-msg ${role}`;
        
        // Convert strict Markdown bolding if Gemini sends it (**text**) to HTML bold
        const formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        div.innerHTML = formattedText;
        
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    
    function showTyping() {
        const id = 'typing-' + Date.now();
        const div = document.createElement('div');
        div.className = 'pbb-typing';
        div.id = id;
        div.innerHTML = '<div class="pbb-dot"></div><div class="pbb-dot"></div><div class="pbb-dot"></div>';
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return id;
    }
    
    function removeTyping(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }
    
})();
