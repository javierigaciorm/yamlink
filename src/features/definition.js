const vscode = require('vscode');

function registerDefinition(context, getIndex) {
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider('markdown', {
            provideDefinition(document, position) {
                const idIndex = getIndex();
                const line = document.lineAt(position.line).text;
                const regex = /\[\[([^\]]+)\]\]/g;

                let match;
                while ((match = regex.exec(line)) !== null) {
                    const start = match.index;
                    const end = start + match[0].length;

                    if (position.character >= start && position.character <= end) {
                        const id = match[1];
                        const filePath = idIndex.get(id);
                        if (!filePath) return;

                        return new vscode.Location(
                            vscode.Uri.file(filePath),
                            new vscode.Position(0, 0)
                        );
                    }
                }
            }
        })
    );
}

module.exports = { registerDefinition };