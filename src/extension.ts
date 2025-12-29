import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

export function activate(context: vscode.ExtensionContext) {
    let agentMoodActive = false; // State for the agent mood

    let command = vscode.commands.registerCommand('chatbot.start', () => {
        const panel = vscode.window.createWebviewPanel(
            'chatbot',
            'Chatbot',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'src', 'webview')]
            }
        );

        const htmlPath = path.join(context.extensionPath, 'src', 'webview', 'index.html');
        panel.webview.html = fs.readFileSync(htmlPath, 'utf8');

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'setAgentMood':
                        agentMoodActive = message.enabled;
                        return;
                    case 'sendMessage':
                        panel.webview.postMessage({ command: 'showLoading' });
                        try {
                            let aiResponse;
                            if (agentMoodActive) {
                                aiResponse = await getAgentResponse(message.text, panel);
                            } else {
                                aiResponse = await getAiResponse(message.text);
                            }
                            panel.webview.postMessage({ command: 'receiveMessage', text: aiResponse });
                        } catch (error: any) {
                             panel.webview.postMessage({ command: 'receiveMessage', text: `Sorry, something went wrong: ${error.message}` });
                        } finally {
                            panel.webview.postMessage({ command: 'hideLoading' });
                        }
                        return;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(command);
}

export function deactivate() {}

async function getAgentResponse(userMessage: string, panel: vscode.WebviewPanel): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return "I can only work with files if you have a folder open in your workspace.";
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    let prompt = `You are a helpful AI assistant in VS Code.
The user has enabled "Agent Mood", which means you have the ability to read and write files in the user's workspace.
The workspace root is: ${workspaceRoot}

    You can use the following commands by embedding them in your response:
- [READ_FILE: path/to/file.ext] - Reads a file from the workspace. The path should be relative to the workspace root.
- [WRITE_FILE: path/to/file.ext]
content to write
[END_WRITE_FILE] - Writes content to a file in the workspace. The path should be relative to the workspace root.

    When you use a command, the tool will execute it and the result will be fed back to you.
    If you read a file, the content will be provided to you in the next turn. You can then use that information to answer the user's question.
    After performing a file operation, you should provide a summary of what you did to the user.

    User's prompt: ${userMessage}
`;

    let aiResponse = await getAiResponse(prompt);

    // This is a simplified loop. A real implementation would need a more robust way to handle multiple tool calls.
    if (aiResponse.includes('[READ_FILE:')) {
        const filePathMatch = aiResponse.match(/[\[]READ_FILE: (.*?)[\]]/);
        if (filePathMatch) {
            const filePath = path.join(workspaceRoot, filePathMatch[1]);
            try {
                const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
                const fileContentString = Buffer.from(fileContent).toString('utf8');
                prompt += `
[TOOL_RESULT] File content of ${filePathMatch[1]}:
${fileContentString}
[END_TOOL_RESULT]
`;
                // Call AI again with file content
                aiResponse = await getAiResponse(prompt);
            } catch (e: any) {
                aiResponse = `I was unable to read the file ${filePathMatch[1]}. Error: ${e.message}`;
            }
        }
    } else if (aiResponse.includes('[WRITE_FILE:')) {
        const filePathMatch = aiResponse.match(/[\[]WRITE_FILE: (.*?)[\]]/);
        const contentMatch = aiResponse.match(/[\]]\n([\s\S]*?)[\]END_WRITE_FILE][\s\S]*/);
        if (filePathMatch && contentMatch) {
            const filePath = path.join(workspaceRoot, filePathMatch[1]);
            const content = contentMatch[1];
            try {
                await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf8'));
                aiResponse = `I have written the content to ${filePathMatch[1]}.`;
            } catch (e: any) {
                aiResponse = `I was unable to write to the file ${filePathMatch[1]}. Error: ${e.message}`;
            }
        }
    }

    return aiResponse;
}


async function getAiResponse(userMessage: string): Promise<string> {
    const POLLINATIONS_API_BASE_URL = "https://text.pollinations.ai/";

    const encodedMessage = encodeURIComponent(userMessage);
    const fullUrl = `${POLLINATIONS_API_BASE_URL}${encodedMessage}`;

    const urlParts = fullUrl.match(/^https?:\/\/([^/]+)(.*)$/);
    if (!urlParts || urlParts.length < 3) {
        return Promise.reject(new Error("Invalid Pollinations API URL constructed."));
    }
    const hostname = urlParts[1];
    const path = urlParts[2] || '/';

    const options = {
        hostname: hostname,
        path: path,
        method: 'GET',
        headers: {
            'Content-Type': 'text/plain',
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
                    resolve(data.trim());
                } else {
                    vscode.window.showErrorMessage(`Pollinations AI: Request failed with status ${res.statusCode}: ${data}`);
                    reject(new Error(`AI: Error from Pollinations AI (Status: ${res.statusCode}).`));
                }
            });
        });

        req.on('error', (e) => {
            vscode.window.showErrorMessage(`Pollinations AI: Request failed: ${e.message}`);
            reject(new Error(`AI: Failed to connect to Pollinations AI: ${e.message}`));
        });

        req.end();
    });
}