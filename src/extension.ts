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

    const symbols = this.findPythonSymbols(document, config);
    const codeLenses: vscode.CodeLens[] = [];

    for (const symbol of symbols) {
      if (token.isCancellationRequested) {
        return [];
      }

      const codeLens = new vscode.CodeLens(symbol.range);
      (codeLens as any).symbolPosition = symbol.position;
      (codeLens as any).symbolName = symbol.name;
      (codeLens as any).documentUri = document.uri;
      codeLenses.push(codeLens);
    }

    return codeLenses;
  }

  public async resolveCodeLens(
    codeLens: vscode.CodeLens,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens> {
    const config = vscode.workspace.getConfiguration('pythonReferenceLens');
    const minRefs = config.get<number>('minReferencesToShow', 0);

    const symbolPosition = (codeLens as any).symbolPosition as vscode.Position;
    const symbolName = (codeLens as any).symbolName as string;
    const documentUri = (codeLens as any).documentUri as vscode.Uri;

    try {
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        documentUri,
        symbolPosition
      );

      if (token.isCancellationRequested) {
        return codeLens;
      }

      // Subtract 1 to exclude the definition itself
      const referenceCount = locations ? Math.max(0, locations.length - 1) : 0;

      if (referenceCount < minRefs) {
        codeLens.command = {
          title: '',
          command: ''
        };
        return codeLens;
      }

      const title = referenceCount === 0
        ? '$(references) no references'
        : referenceCount === 1
          ? '$(references) 1 reference'
          : `$(references) ${referenceCount} references`;

      codeLens.command = {
        title: title,
        command: 'editor.action.findReferences',
        arguments: [documentUri, symbolPosition],
        tooltip: `Find all references to ${symbolName}`
      };
    } catch (error) {
      codeLens.command = {
        title: '$(error) Error finding references',
        command: ''
      };
    }

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
        
        // Skip private/dunder methods if they start with _
        // (optional: you can remove this if you want to show all)
        
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
