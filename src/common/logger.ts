import * as vscode from 'vscode';
import { BLINK_NAME } from '../constants';
import type { ILogger } from './logging.js';

// ILogger (interface + merged token) lives in logging.ts (pure) so logic
// modules can import it without pulling in vscode; re-exported here for
// adapter convenience.
export { ILogger } from './logging.js';

export class Logger implements ILogger {
  private _outputChannel = vscode.window.createOutputChannel(
    BLINK_NAME[0].toUpperCase() + BLINK_NAME.slice(1), { log: true });

  constructor(private readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(this._outputChannel);
  }

  public error(message: string | Error, ...args: any[]) {
    this._outputChannel.error(message, args);
    vscode.window.showErrorMessage(message.toString());
  }

  public info(message: string) {
    this._outputChannel.info(message);
  }

  public trace(message: string) {
    this._outputChannel.trace(message);
  }

  public warn(message: string) {
    this._outputChannel.warn(message);
  }

  public show() {
    this._outputChannel.show();
  }

  public dispose() {
    this._outputChannel.dispose();
  }
}