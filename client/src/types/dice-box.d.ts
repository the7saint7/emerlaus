declare module "@3d-dice/dice-box" {
  export interface DiceBoxOptions {
    assetPath: string;
    container?: string;
    onRollComplete?: (results: unknown) => void;
    [key: string]: unknown;
  }

  export default class DiceBox {
    constructor(options: DiceBoxOptions);
    init(): Promise<void>;
    roll(
      notation: string | Array<Record<string, unknown>>,
      options?: Record<string, unknown>
    ): Promise<unknown>;
    clear(): DiceBox;
    updateConfig?(options: Record<string, unknown>): void;
    onRollComplete: (results: unknown) => void;
  }
}
