import { describe, expect, it } from "vitest";
import { Store } from "@/app/store";

/** 受け取った値と、受け取り手の例外を記録する */
function recorded() {
  const errors: unknown[] = [];
  const store = new Store("読み込み中", (error) => errors.push(error));
  return { store, errors };
}

describe("Store", () => {
  it("購読するとすぐに今の値を受け取り、その後は流れた値を順に受け取る", () => {
    const { store } = recorded();
    const received: string[] = [];
    store.subscribe((value) => received.push(value));
    store.emit("ボード");
    expect(received).toEqual(["読み込み中", "ボード"]);
  });

  it("後から購読しても、最後に流れた値を受け取る", () => {
    const { store } = recorded();
    store.emit("ボード");
    const received: string[] = [];
    store.subscribe((value) => received.push(value));
    expect(received).toEqual(["ボード"]);
  });

  it("購読をやめると、それ以後の値は受け取らない", () => {
    const { store } = recorded();
    const received: string[] = [];
    const stop = store.subscribe((value) => received.push(value));
    stop();
    store.emit("ボード");
    expect(received).toEqual(["読み込み中"]);
  });

  it("1つの受け取り手の例外で、ほかの受け取り手を止めず、例外は onError へ渡す", () => {
    const { store, errors } = recorded();
    const failure = new Error("描けない");
    const received: string[] = [];
    store.subscribe((value) => {
      if (value === "ボード") {
        throw failure;
      }
    });
    store.subscribe((value) => received.push(value));
    store.emit("ボード");
    expect(received).toEqual(["読み込み中", "ボード"]);
    expect(errors).toEqual([failure]);
  });
});
