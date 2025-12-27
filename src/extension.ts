import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "chatbot" is now active!');

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
                                vscode.window.showInformationMessage(`User message: ${message.text}`);
                                // Placeholder for AI response
                                const aiResponse = await getAiResponse(message.text);
                                panel?.webview.postMessage({ command: 'receiveMessage', text: aiResponse });
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
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column; }
        #messages { flex-grow: 1; overflow-y: auto; padding: 10px; background-color: #f0f0f0; }
        #input-area { display: flex; padding: 10px; background-color: #e0e0e0; border-top: 1px solid #ccc; }
        #message-input { flex-grow: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
        #send-button { margin-left: 10px; padding: 8px 15px; background-color: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; }
        #send-button:hover { background-color: #005f99; }
        .message-bubble { padding: 8px 12px; border-radius: 15px; margin-bottom: 8px; max-width: 80%; }
        .user-message { background-color: #dcf8c6; align-self: flex-end; margin-left: auto; }
        .ai-message { background-color: #ffffff; align-self: flex-start; }
    </style>
</head>
<body>
    <div id="messages"></div>
    <div id="input-area">
        <input type="text" id="message-input" placeholder="Type your message...">
        <button id="send-button">Send</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');

        function appendMessage(sender, text) {
            const bubble = document.createElement('div');
            bubble.classList.add('message-bubble');
            if (sender === 'user') {
                bubble.classList.add('user-message');
            } else {
                bubble.classList.add('ai-message');
            }
            bubble.textContent = text;
            messagesDiv.appendChild(bubble);
            messagesDiv.scrollTop = messagesDiv.scrollHeight; // Auto-scroll to bottom
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
            }
        });
    </script>
</body>
</html>`;
}

// Placeholder function for AI response
async function getAiResponse(userMessage: string): Promise<string> {
    // In a real extension, you would make an API call here.
    // For now, we'll return a simple echo or a canned response.
    return `AI: You said, "${userMessage}". I'm a placeholder AI.`;
}
