import { Signer } from "ethers";

import { Constructor } from "./types";

export interface IConnectable {
  connect(signer: Signer | null, user?: string | null): void;
  disconnect(): void;
}

export function Connectable<TBase extends Constructor>(Base: TBase) {
  return class extends Base implements IConnectable {
    readonly _isConnectable = true;

    _signer: Signer | null = null;
    _user: string | null = null;

    public connect(signer: Signer | null, user: string | null = null) {
      this._signer = signer;
      this._user = user;
    }

    public disconnect() {
      this._signer = null;
      this._user = null;
    }
  };
}

export function isConnectable(connectable: any): connectable is IConnectable {
  return !!(connectable && connectable._isConnectable);
}
