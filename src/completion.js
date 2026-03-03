const vscode = require('vscode');

function registerCompletion(context, getIndex) {
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            'markdown',
            {
                provideCompletionItems(document, position) {
                    const idIndex = getIndex();
                    const lineText = document.lineAt(position.line).text;
                    const textBeforeCursor = lineText.substring(0, position.character);

                    const match = textBeforeCursor.match(/\[\[([^\]]*)$/);
                    if (!match) return undefined;

                    const partial = match[1];
                    const bracketStart = position.character - partial.length - 2;

                    const textAfterCursor = lineText.substring(position.character);
                    const hasClosingBrackets = textAfterCursor.startsWith(']]');

                    const replaceRange = new vscode.Range(
                        new vscode.Position(position.line, bracketStart),
                        new vscode.Position(
                            position.line,
                            position.character + (hasClosingBrackets ? 2 : 0)
                        )
                    );

                    return Array.from(idIndex.keys())
                        .filter(id => id.toLowerCase().startsWith(partial.toLowerCase()))
                        .map(id => {
                            const item = new vscode.CompletionItem(
                                id,
                                vscode.CompletionItemKind.Reference
                            );

                            item.insertText = `[[${id}]]`;
                            item.range = replaceRange;
                            item.filterText = `[[${id}`;
                            item.sortText = id;
                            item.detail = idIndex.get(id);

                            return item;
                        });
                }
            },
            '['
        )
    );
}

module.exports = { registerCompletion };