import * as vscode from "vscode";
import { isWhitespace, syntaxChars, showSuggestFor } from "./Constants";
import { Completion } from "./server/Protocol";
export class DocumentWalker {
    public constructor(private document: vscode.TextDocument) { }

    /**
     * @param completionPos The position at which the user is currently typing
     * Travels through the document to see what type of completion should appear right now.
     * @returns CompletionType.TYPE if a list of types should show,
     * CompletionType.EXTENSION if the extension methods of a type should show, and CompletionType.NONE if no completions should appear.
     */
    public async getCompletionType(completionPos: vscode.Position): Promise<CompletionType> {
        let currentPos = this.getPrev(completionPos);

        let currentChar = this.getChar(currentPos);

        // Travel to before this word
        while (!isWhitespace(currentChar)) {
            if (currentChar === ".") {
                return CompletionType.EXTENSION;
            }
            if (syntaxChars.includes(currentChar)) return CompletionType.TYPE;
            currentPos = this.getPrev(currentPos);
            currentChar = this.getChar(currentPos);
        }

        currentPos = this.walkBackWhile(currentPos, this.shouldKeepSearchingForCompletionIdentifier.bind(this));
        if (this.getChar(currentPos) === ".") return CompletionType.EXTENSION;

        let wordRegex = /([^\s]+)/;

        let wordBefore = this.document.getText(this.document.getWordRangeAtPosition(currentPos, wordRegex));
        let lastCharOfWordBefore = wordBefore.slice(-1);

        if (syntaxChars.includes(lastCharOfWordBefore)) return CompletionType.TYPE;
        else if (showSuggestFor.includes(wordBefore)) return CompletionType.TYPE;
        return CompletionType.NONE;
    }

    private shouldKeepSearchingForCompletionIdentifier(currentChar: string, newLineIncoming: boolean, currentPos: vscode.Position): boolean {
        // Look one char further back so the walkBackWhile function will return the line AFTER the comment line in case a comment was found.
        let nextPos = this.getPrev(currentPos);
        // let nextChar = this.getChar(nextPos);

        // Ignore comment lines
        if (newLineIncoming) {
            let slashLastPos = false;
            let shouldKeepSearching = true;
            this.walkBackWhile(nextPos, (char, newLine) => {
                if (char === "/") {
                    if (slashLastPos) {
                        // Comment line
                        shouldKeepSearching = false;
                        return false;
                    } else {
                        slashLastPos = true;
                    }
                } else {
                    slashLastPos = false;
                }
                // Continue while on the same line
                return !newLine;
            });

            return shouldKeepSearching;
        }
        return isWhitespace(currentChar);
    }

    /**
     * @param completionPos The position at which the user is currently typing
     * @returns The hover string of the type that should be extended
     */
    public async getMethodCallerHoverString(completionPos: vscode.Position): Promise<string | undefined> {
        let typePos = await this.getTypeInfoPosition(completionPos);
        let hoverString = this.getHoverString(typePos);
        return hoverString;
    }

    /**
     * Travels through the document to see where exactly is the variable that is trying to invoker a method.
     * This could also be a method call. Examples:
     * x.F   <--- completionPos is after f, we are looking for x.
     * x.Foo(bar).b <--- completionPos is after b, we are looking for Foo.
     * @param completionPos The position in which the user is typing
     * @returns The position of the method or variable that is trying to invoke a method
     */
    private async getTypeInfoPosition(completionPos: vscode.Position): Promise<vscode.Position> {
        let startOfCaller = this.walkBackWhile(completionPos, isWhitespace);
        let dotPos = this.walkBackWhile(startOfCaller, char => char !== ".");
        let endOfWordBefore = this.getPrev(this.walkBackWhile(dotPos, isWhitespace));

        // If there are brackets we need to check if it's because of a chained method call or because of redundant parentheses
        if (this.getChar(endOfWordBefore) === ")") {
            let bracketsThatNeedToBeClosed = 1;
            let methodCallPos = this.walkBackWhile(this.getPrev(endOfWordBefore), (char) => {
                if (char === ")") bracketsThatNeedToBeClosed++;
                if (char === "(") bracketsThatNeedToBeClosed--;

                return bracketsThatNeedToBeClosed > 0;
            });

            // Chained method call
            if ((await this.getHover(methodCallPos)).length > 0) {
                return methodCallPos;
            }
            // Redundant parentheses
            else {
                let variablePos = this.walkBackWhile(endOfWordBefore, char => char === ")");
                return variablePos;
            }





        } else {
            return endOfWordBefore;
        }


    }





    /**
     * Reduces the position of startingPosition (walks back) as long the condition is met.
     */
    private walkBackWhile(startingPosition: vscode.Position,
        condition: (char: string, newLineIncoming: boolean, pos: vscode.Position) => boolean): vscode.Position {
        let currentPos = startingPosition;
        let currentChar = this.getChar(currentPos);
        let newLineIncoming = false;
        while (condition(currentChar, newLineIncoming, currentPos)) {
            [currentPos, newLineIncoming] = this.getPrevCheckNewline(currentPos);
            currentChar = this.getChar(currentPos);
        }

        return currentPos;
    }

    /**
     * @returns The hover string in a position
     */
    private async getHoverString(position: vscode.Position): Promise<string | undefined> {
        // Get the hover info of the variable from the C# extension
        let hover = await this.getHover(position);
        if (hover.length === 0) return undefined;

        return (<{ language: string; value: string }>hover[0].contents[1]).value;


    }

    /**
     * @returns All hover info in a position
     */
    private async getHover(position: vscode.Position): Promise<vscode.Hover[]> {
        return <vscode.Hover[]>(await vscode.commands.executeCommand("vscode.executeHoverProvider", this.document.uri, position));
    }


    /**
     * Returns the character at a position in the document
     */
    private getChar(pos: vscode.Position): string {
        return this.document.getText(new vscode.Range(pos, pos.translate(0, 1)));
    }

    /**
     * Returns the position before another position in the document
     */
    private getPrev(pos: vscode.Position): vscode.Position {
        return this.document.positionAt(this.document.offsetAt(pos) - 1);
    }

    /**
    * Returns the position before another position in the document AND whether or not the next previous character will reach a new line.
    */
    private getPrevCheckNewline(pos: vscode.Position): [vscode.Position, boolean] {
        let newPos = this.getPrev(pos);
        let newLine =  newPos.line !== this.getPrev(newPos).line;
        return [newPos, newLine];
    }

    public getWordToComplete(completionPosition: vscode.Position): string {
        let wordToComplete = '';
        let range = this.document.getWordRangeAtPosition(completionPosition);
        if (range) {
            wordToComplete = this.document.getText(new vscode.Range(range.start, completionPosition)).toLowerCase();
        }
        return wordToComplete;
    }

    public async filterByTypedWord(completionPosition: vscode.Position, completions: Completion[]): Promise<Completion[]> {
        let wordToComplete = this.getWordToComplete(completionPosition);
        // let range = this.document.getWordRangeAtPosition(completionPosition);
        // if (range) {
        //     wordToComplete = this.document.getText(newLine vscode.Range(range.start, completionPosition)).toLowerCase();
        // }
        let matcher = (f: Completion) => f.name.toLowerCase().indexOf(wordToComplete) > -1;
        let found = completions.filter(matcher);
        return found;
    }

    /**
	 * @param document The text document to search usings of
	 * @returns A list of the namespaces being used in the text document
	 */
    public async getUsings(): Promise<string[]> {
        let regExp = /^using.*;/gm;
        let matches = this.document.getText().match(regExp);
        if (matches === null) return [];
        return Promise.all(matches.map(async using => {
            let usingWithSC = using.split(" ")[1];
            return usingWithSC.substring(0, usingWithSC.length - 1);
        }));

    }
}

export enum CompletionType {
    NONE,
    TYPE,
    EXTENSION
}