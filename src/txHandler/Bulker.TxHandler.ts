import { Operation } from "src/simulation/simulation.types";

import { TransactionOptions } from "../types";

import { NotifierManager } from "./NotifierManager";
import { IBatchTxHandler } from "./TxHandler.interface";

export default class BulkerTxHandler extends NotifierManager implements IBatchTxHandler {
  public handleBatchTransaction(
    operations: Operation[],
    options?: TransactionOptions | undefined
  ): Promise<any> {
    return Promise.reject("TODO: to implement");
  }
}
