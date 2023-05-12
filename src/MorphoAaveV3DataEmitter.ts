import { deepCopy } from "ethers/lib/utils";
import { Subject } from "rxjs";

import { MorphoAaveV3DataHolder } from "./MorphoAaveV3DataHolder";
import { MarketsConfigs, MarketsData, UserMarketsData } from "./adapter.types";
import { FetchedStatic, FetchedUpdated, GlobalData, UserData } from "./types";

export abstract class MorphoAaveV3DataEmitter extends MorphoAaveV3DataHolder {
  /* Subjects */
  public readonly marketsConfigs$ = new Subject<MarketsConfigs>();
  public readonly marketsData$ = new Subject<MarketsData>();
  public readonly userMarketsData$ = new Subject<UserMarketsData>();
  public readonly marketsList$ = new Subject<FetchedStatic<string[]>>();
  public readonly userData$ = new Subject<FetchedUpdated<UserData>>();
  public readonly globalData$ = new Subject<FetchedUpdated<GlobalData>>();

  /* Setters */
  protected set marketsConfigs(mc: MarketsConfigs) {
    this._marketsConfigs = mc;
    this.marketsConfigs$.next(deepCopy(mc));
  }
  protected set marketsData(md: MarketsData) {
    this._marketsData = md;
    this.marketsData$.next(deepCopy(md));
  }
  protected set userMarketsData(umd: UserMarketsData) {
    this._userMarketsData = umd;
    this.userMarketsData$.next(deepCopy(umd));
  }
  protected set marketsList(ml: FetchedStatic<string[]>) {
    this._marketsList = ml;
    this.marketsList$.next(deepCopy(ml));
  }
  protected set userData(ud: FetchedUpdated<UserData>) {
    this._userData = ud;
    this.userData$.next(deepCopy(ud));
  }
  protected set globalData(gd: FetchedUpdated<GlobalData>) {
    this._globalData = gd;
    this.globalData$.next(deepCopy(gd));
  }
}
