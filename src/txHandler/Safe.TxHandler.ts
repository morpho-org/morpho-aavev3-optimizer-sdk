import { MorphoAaveV3DataHolder } from "src/MorphoAaveV3DataHolder";

import BulkerTxHandler from "./Bulker.TxHandler";
import { Bulker } from "./Bulker.TxHandler.interface";
import { IBatchTxHandler } from "./TxHandler.interface";

export class SafeTxHandler extends BulkerTxHandler implements IBatchTxHandler {
  readonly autosign = false; // no signature on safe

  public async sign(): Promise<void> {
    throw Error("Cannot sign using the SafeTxHandler");
  }

  protected _removeSignature(): void {}

  protected _askForSignature() {}

  protected _addSignature() {}

  async executeBatch(options?: Bulker.TransactionOptions): Promise<any> {
    console.debug(
      this.signatures$.getValue(),
      this.bulkerOperations$.getValue(),
      this.simulatorOperations$.getValue()
    );
  }

  protected _approveManager(data: MorphoAaveV3DataHolder) {
    return { data, batch: [] };
  }

  protected _transferToBulker(data: MorphoAaveV3DataHolder) {
    return { data, batch: [], defers: [] };
  }
}
