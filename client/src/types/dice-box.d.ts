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
    roll(notation: string, options?: Record<string, unknown>): void;
    clear(): DiceBox;
    onRollComplete: (results: unknown) => void;
  }
}
