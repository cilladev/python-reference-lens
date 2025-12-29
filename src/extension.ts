import * as vscode from 'vscode';

interface PythonSymbol {
  name: string;
  range: vscode.Range;
  position: vscode.Position;
  kind: 'function' | 'class' | 'method';
}

class PythonReferenceCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private cache: Map<string, { lenses: vscode.CodeLens[]; timestamp: number }> = new Map();
  private cacheTimeout = 5000; // 5 seconds

  constructor() {
    // Refresh CodeLens when document changes
    vscode.workspace.onDidChangeTextDocument(() => {
      this._onDidChangeCodeLenses.fire();
    });

    // Refresh CodeLens when configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('pythonReferenceLens')) {
        this.cache.clear();
        this._onDidChangeCodeLenses.fire();
      }
    });
  }

  public async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    const config = vscode.workspace.getConfiguration('pythonReferenceLens');
    
    if (!config.get<boolean>('enabled', true)) {
      return [];
    }

    const minRefs = config.get<number>('minReferencesToShow', 1);
    const symbols = this.findPythonSymbols(document, config);
    const codeLenses: vscode.CodeLens[] = [];

    for (const symbol of symbols) {
      if (token.isCancellationRequested) {
        return [];
      }

      // Check references before creating CodeLens
      try {
        const locations = await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeReferenceProvider',
          document.uri,
          symbol.position
        );

        // Subtract 1 to exclude the definition itself
        const referenceCount = locations ? Math.max(0, locations.length - 1) : 0;

        // Skip if below minimum references threshold
        if (referenceCount < minRefs) {
          continue;
        }

        const title = referenceCount === 1
          ? '$(references) 1 reference'
          : `$(references) ${referenceCount} references`;

        const codeLens = new vscode.CodeLens(symbol.range, {
          title: title,
          command: 'editor.action.findReferences',
          arguments: [document.uri, symbol.position],
          tooltip: `Find all references to ${symbol.name}`
        });

        codeLenses.push(codeLens);
      } catch (error) {
        // Skip this symbol on error
        continue;
      }
    }

    return codeLenses;
  }

  public async resolveCodeLens(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    // CodeLens is already resolved in provideCodeLenses
    return codeLens;
  }

  private findPythonSymbols(
    document: vscode.TextDocument,
    config: vscode.WorkspaceConfiguration
  ): PythonSymbol[] {
    const symbols: PythonSymbol[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    const showFunctions = config.get<boolean>('showForFunctions', true);
    const showClasses = config.get<boolean>('showForClasses', true);
    const showMethods = config.get<boolean>('showForMethods', true);

    let inClass = false;
    let classIndent = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      
      // Skip empty lines and comments
      if (line.trim() === '' || line.trim().startsWith('#')) {
        continue;
      }

      // Check for class definition
      const classMatch = line.match(/^(\s*)class\s+(\w+)/);
      if (classMatch) {
        inClass = true;
        classIndent = classMatch[1].length;
        
        if (showClasses) {
          const nameStart = line.indexOf(classMatch[2]);
          symbols.push({
            name: classMatch[2],
            range: new vscode.Range(lineNum, 0, lineNum, line.length),
            position: new vscode.Position(lineNum, nameStart),
            kind: 'class'
          });
        }
        continue;
      }

      // Check for function/method definition
      const funcMatch = line.match(/^(\s*)(async\s+)?def\s+(\w+)/);
      if (funcMatch) {
        const indent = funcMatch[1].length;
        const funcName = funcMatch[3];
        
        // Skip __init__ methods
        if (funcName === '__init__') {
          continue;
        }
        
        // Determine if it's a method or function
        const isMethod = inClass && indent > classIndent;
        
        // Update class tracking
        if (indent <= classIndent) {
          inClass = false;
        }

        if (isMethod && !showMethods) {
          continue;
        }
        if (!isMethod && !showFunctions) {
          continue;
        }

        const nameStart = line.indexOf(funcName);
        symbols.push({
          name: funcName,
          range: new vscode.Range(lineNum, 0, lineNum, line.length),
          position: new vscode.Position(lineNum, nameStart),
          kind: isMethod ? 'method' : 'function'
        });
      }
    }

    return symbols;
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Python Reference Lens is now active');

  const provider = new PythonReferenceCodeLensProvider();

  const disposable = vscode.languages.registerCodeLensProvider(
    { language: 'python', scheme: 'file' },
    provider
  );

  context.subscriptions.push(disposable);

  // Register command to toggle the extension
  const toggleCommand = vscode.commands.registerCommand(
    'pythonReferenceLens.toggle',
    () => {
      const config = vscode.workspace.getConfiguration('pythonReferenceLens');
      const currentValue = config.get<boolean>('enabled', true);
      config.update('enabled', !currentValue, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `Python Reference Lens ${!currentValue ? 'enabled' : 'disabled'}`
      );
    }
  );

  context.subscriptions.push(toggleCommand);
}

export function deactivate() {
  console.log('Python Reference Lens deactivated');
}