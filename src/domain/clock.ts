/** 現在時刻の取得元。ドメイン層は時刻を引数で受け取り、実体はアダプタ層が持つ（AD-1） */
export interface Clock {
  now(): Date;
}
