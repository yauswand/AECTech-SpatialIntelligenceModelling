// Chatbot Component - User interaction interface
export class Chatbot {
    constructor(onSendMessage) {
        this.onSendMessage = onSendMessage;
        this.messages = [];
        this.element = null;
    }

    create() {
        const chatbot = document.createElement('div');
        chatbot.id = 'chatbot';
        chatbot.className = 'chatbot';
        
        chatbot.innerHTML = `
            <div class="chatbot-header">
                <h3>Renovation Assistant</h3>
            </div>
            <div class="chatbot-messages" id="chatbot-messages">
                <div class="message bot-message">
                    <p>Hello! Upload a room image and tell me how you'd like to renovate it, or upload a reference image for inspiration.</p>
                </div>
            </div>
            <div class="chatbot-input-area">
                <div class="input-actions">
                    <button id="attach-image-btn" class="btn-icon" title="Attach image">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <circle cx="8.5" cy="8.5" r="1.5"></circle>
                            <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                    </button>
                    <input type="file" id="chat-image-input" accept="image/*" style="display: none;">
                </div>
                <textarea id="chat-input" class="chat-input" placeholder="Describe how you want to renovate the room..."></textarea>
                <button id="send-message-btn" class="btn-primary">Send</button>
            </div>
        `;

        // Setup input handlers
        const input = chatbot.querySelector('#chat-input');
        const sendBtn = chatbot.querySelector('#send-message-btn');
        const attachBtn = chatbot.querySelector('#attach-image-btn');
        const fileInput = chatbot.querySelector('#chat-image-input');
        
        const sendMessage = () => {
            const text = input.value.trim();
            if (text) {
                this.addMessage('user', text);
                input.value = '';
                
                if (this.onSendMessage) {
                    this.onSendMessage(text);
                }
            }
        };

        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        attachBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    this.addMessage('user', 'Reference image uploaded', event.target.result);
                    
                    if (this.onSendMessage) {
                        this.onSendMessage(null, event.target.result);
                    }
                };
                reader.readAsDataURL(file);
            }
        });

        this.element = chatbot;
        return chatbot;
    }

    addMessage(role, text, imageSrc = null) {
        const messagesContainer = this.element.querySelector('#chatbot-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        
        if (imageSrc) {
            const img = document.createElement('img');
            img.src = imageSrc;
            img.className = 'message-image';
            messageDiv.appendChild(img);
        }
        
        if (text) {
            const p = document.createElement('p');
            p.textContent = text;
            messageDiv.appendChild(p);
        }
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        this.messages.push({ role, text, imageSrc });
    }

    addLoadingMessage() {
        const messagesContainer = this.element.querySelector('#chatbot-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message loading';
        messageDiv.innerHTML = '<div class="loading-dots"><span></span><span></span><span></span></div>';
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return messageDiv;
    }

    removeLoadingMessage(loadingElement) {
        if (loadingElement && loadingElement.parentNode) {
            loadingElement.remove();
        }
    }
}

