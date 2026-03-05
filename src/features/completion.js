const vscode = require('vscode');
const { getTypes } = require('../registries/typeRegistry');

function registerCompletion(context, getIndex) {
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            'markdown',
            {
                provideCompletionItems(document, position) {
                    const line             = document.lineAt(position.line).text;
                    const textBeforeCursor = line.substring(0, position.character);

                    // ── [[wikilink]] autocomplete ──
                    const wikiMatch = textBeforeCursor.match(/\[\[([^\]]*)$/);
                    if (wikiMatch) {
                        const idIndex         = getIndex();
                        const partial         = wikiMatch[1];
                        const bracketStart    = position.character - partial.length - 2;
                        const textAfterCursor = line.substring(position.character);
                        const hasClosing      = textAfterCursor.startsWith(']]');

                        const replaceRange = new vscode.Range(
                            new vscode.Position(position.line, bracketStart),
                            new vscode.Position(
                                position.line,
                                position.character + (hasClosing ? 2 : 0)
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
                                item.range      = replaceRange;
                                item.filterText = `[[${id}`;
                                item.sortText   = id;
                                item.detail     = idIndex.get(id);
                                return item;
                            });
                    }

                    // ── type: dropdown — purely from live vault registry ──
                    // No hardcoded values. Registry is derived from what
                    // actually exists in the vault. User owns all types.
                    const typeMatch = textBeforeCursor.match(/^type:\s*(\S*)$/);
                    if (typeMatch) {
                        const knownTypes = [...getTypes()];
                        if (knownTypes.length === 0) return undefined;

                        return knownTypes.map(t => {
                            const item = new vscode.CompletionItem(
                                t,
                                vscode.CompletionItemKind.EnumMember
                            );
                            item.detail     = 'Type used in vault';
                            item.insertText = t;
                            item.sortText   = t;
                            return item;
                        });
                    }

                    return undefined;
                }
            },
            '[', ':'
        )
    );
}

module.exports = { registerCompletion };