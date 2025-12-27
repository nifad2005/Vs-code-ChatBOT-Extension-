import * as vscode from 'vscode';
import * as https from 'https'; // Import the https module

const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g; // Define regex globally

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "chatbot" is now active!');

    // Register Chat Participant
    const chatParticipant = vscode.chat.registerChatParticipant(
        'chatbot.chat',
        async (request: vscode.ChatRequest, context: vscode.ChatContext, response: vscode.ChatResponse, token: vscode.CancellationToken) => {
            const userMessage = request.prompt;
            response.progress({ content: 'Thinking...' });

            try {
                const aiResponse = await getAiResponse(userMessage);
                response.markdown(aiResponse);
            } catch (error: any) {
                const errorMessage = `Chatbot AI Error: ${error.message}`;
                vscode.window.showErrorMessage(errorMessage);
                response.markdown(`An error occurred while getting a response: ${errorMessage}`);
            }
        }
    );
    context.subscriptions.push(chatParticipant);

    let panel: vscode.WebviewPanel | undefined;

    context.subscriptions.push(
        vscode.commands.registerCommand('chatbot.startConversation', () => {
            if (panel) {
                panel.reveal(vscode.ViewColumn.One);
            } else {
                panel = vscode.window.createWebviewPanel(
                    'chatbotConversation',
                    'Chatbot Conversation',
                    vscode.ViewColumn.Beside,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true
                    }
                );

                panel.webview.html = getWebviewContent();

                panel.webview.onDidReceiveMessage(
                    async message => {
                        switch (message.command) {
                            case 'sendMessage':
                                // Remove the info message
                                // vscode.window.showInformationMessage(`User message: ${message.text}`);
                                panel?.webview.postMessage({ command: 'showLoading' });
                                try {
                                    const aiResponse = await getAiResponse(message.text);
                                    panel?.webview.postMessage({ command: 'receiveMessage', text: aiResponse });
                                } catch (error: any) {
                                    vscode.window.showErrorMessage(`Chatbot error: ${error.message}`);
                                    panel?.webview.postMessage({ command: 'receiveMessage', text: `AI: An error occurred: ${error.message}` });
                                } finally {
                                    panel?.webview.postMessage({ command: 'hideLoading' });
                                }
                                return;
                        }
                    },
                    undefined,
                    context.subscriptions
                );

                panel.onDidDispose(
                    () => {
                        panel = undefined;
                    },
                    null,
                    context.subscriptions
                );
            }
        })
    );
}

export function deactivate() {}

function getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chatbot</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            box-sizing: border-box;
        }
        #messages {
            flex-grow: 1;
            overflow-y: auto;
            padding: 15px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-dropdown-border);
        }
        #input-area {
            display: flex;
            padding: 10px 15px;
            background-color: var(--vscode-editor-background);
            border-top: 1px solid var(--vscode-dropdown-border);
            align-items: center;
            gap: 10px;
        }
        #message-input {
            flex-grow: 1;
            padding: 10px 12px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s;
        }
        #message-input:focus {
            border-color: var(--vscode-focusBorder);
        }
        #send-button {
            padding: 10px 20px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.2s;
            white-space: nowrap;
        }
        #send-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .message-bubble {
            padding: 10px 15px;
            border-radius: 18px;
            margin-bottom: 10px;
            max-width: 75%;
            word-wrap: break-word;
            line-height: 1.5;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            transition: all 0.2s ease-in-out;
            white-space: pre-wrap; /* Preserve whitespace and line breaks */
        }
        .user-message {
            background-color: var(--vscode-gitDecoration-addedResourceForeground); /* Using a theme-friendly color */
            color: var(--vscode-button-foreground);
            align-self: flex-end;
            margin-left: auto;
            border-bottom-right-radius: 2px;
        }
        .ai-message {
            background-color: var(--vscode-terminal-hoverBackground); /* Another theme-friendly color */
            color: var(--vscode-foreground);
            align-self: flex-start;
            border-bottom-left-radius: 2px;
        }
        #loading-indicator {
            display: none;
            padding: 10px;
            text-align: center;
            font-style: italic;
            color: var(--vscode-editorInfo-foreground);
            animation: pulse 1.5s infinite ease-in-out;
        }
        @keyframes pulse {
            0% { opacity: 0.5; }
            50% { opacity: 1; }
            100% { opacity: 0.5; }
        }

        /* Scrollbar styles for elegance */
        #messages::-webkit-scrollbar {
            width: 8px;
        }
        #messages::-webkit-scrollbar-track {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 10px;
        }
        #messages::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-hoverBackground);
            border-radius: 10px;
        }
        #messages::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-activeBackground);
        }

        /* Highlight.js specific styles */
        .hljs {
            background: none !important; /* Let message bubble background handle it */
            padding: 0 !important;
            border-radius: 0 !important;
            font-size: 13px;
        }
        pre code {
            display: block;
            overflow-x: auto;
            padding: 1em;
            background: var(--vscode-editor-background);
            border-radius: 5px;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div id="messages"></div>
    <div id="loading-indicator">AI is thinking...</div>
    <div id="input-area">
        <input type="text" id="message-input" placeholder="Type your message...">
        <button id="send-button">Send</button>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const loadingIndicator = document.getElementById('loading-indicator');

        function appendMessage(sender, text) {
            const bubble = document.createElement('div');
            bubble.classList.add('message-bubble');
            if (sender === 'user') {
                bubble.classList.add('user-message');
            } else {
                bubble.classList.add('ai-message');

                let lastIndex = 0;
                let match;
                const fragment = document.createDocumentFragment();

                while ((match = codeBlockRegex.exec(text)) !== null) {
                    // Add text before the code block
                    if (match.index > lastIndex) {
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                    }

                    // Add the code block
                    const pre = document.createElement('pre');
                    const code = document.createElement('code');
                    const lang = match[1] || 'plaintext'; // Default to plaintext if no language is specified
                    code.classList.add(`language-${lang}`);
                    code.textContent = match[2].trim();
                    pre.appendChild(code);
                    fragment.appendChild(pre);
                    lastIndex = codeBlockRegex.lastIndex;
                }

                // Add any remaining text after the last code block
                if (lastIndex < text.length) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                }
                bubble.appendChild(fragment);
            }
            if (sender === 'user') {
                bubble.textContent = text;
            }
            messagesDiv.appendChild(bubble);
            messagesDiv.scrollTop = messagesDiv.scrollHeight; // Auto-scroll to bottom

            // Highlight any code blocks that were just added
            if (sender === 'ai') {
                bubble.querySelectorAll('pre code').forEach((block) => {
                    hljs.highlightElement(block);
                });
            }
        }

        sendButton.addEventListener('click', () => {
            const text = messageInput.value.trim();
            if (text) {
                appendMessage('user', text);
                vscode.postMessage({
                    command: 'sendMessage',
                    text: text
                });
                messageInput.value = '';
            }
        });

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendButton.click();
            }
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'receiveMessage':
                    appendMessage('ai', message.text);
                    break;
                case 'showLoading':
                    loadingIndicator.style.display = 'block';
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                    break;
                case 'hideLoading':
                    loadingIndicator.style.display = 'none';
                    break;
            }
        });
    </script>
</body>
</html>`;
}

// Placeholder function for AI response
async function getAiResponse(userMessage: string): Promise<string> {
    const POLLINATIONS_API_BASE_URL = "https://text.pollinations.ai/"; // New GET endpoint

    // Encode the user message to be safely included in the URL
    const encodedMessage = encodeURIComponent(userMessage);
    const fullUrl = `${POLLINATIONS_API_BASE_URL}${encodedMessage}`;

    // Manually parse hostname and path from the fullUrl
    // This avoids using `new URL()` which might not be consistently available or typed
    const urlParts = fullUrl.match(/^https?:\/\/([^/]+)(.*)$/);
    if (!urlParts || urlParts.length < 3) {
        return Promise.reject(new Error("Invalid Pollinations API URL constructed."));
    }
    const hostname = urlParts[1];
    const path = urlParts[2] || '/'; // Default to '/' if no path segment

    const options = {
        hostname: hostname,
        path: path,
        method: 'GET',
        headers: {
            'Content-Type': 'text/plain', // Expecting plain text response
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    // Assuming the API returns plain text directly as the response body
                    resolve(data.trim());
                } else {
                    vscode.window.showErrorMessage(`Pollinations AI: Request failed with status ${res.statusCode}: ${data}`);
                    reject(new Error(`AI: Error from Pollinations AI (Status: ${res.statusCode}).`)); // Reject instead of resolve
                }
            });
        });

        req.on('error', (e) => {
            vscode.window.showErrorMessage(`Pollinations AI: Request failed: ${e.message}`);
            reject(new Error(`AI: Failed to connect to Pollinations AI: ${e.message}`));
        });

        req.end(); // For GET requests, no payload is written
    });
}
