import Sortable from "sortablejs";
import type { Action } from "svelte/action";
import type { Status } from "@/domain/todo-line";

/** ドロップした結果。position は、動かしたカードを除いたドロップ先の列の中で何番目か（moveCard と同じ数え方） */
export interface Drop {
  key: string;
  status: Status;
  position: number;
}

interface Options {
  status: Status;
  onDrop: (drop: Drop) => void;
}

/**
 * 列の <ol> に付ける。SortableJS が動かした DOM はドロップの直後に元へ戻し、
 * 並びは Markdown を書き換えて読み直した結果で Svelte が描く（AD-2）。DOM を書き換える主体を Svelte だけにする
 */
export const sortable: Action<HTMLElement, Options> = (node, initial) => {
  let options = initial;
  node.dataset.status = options.status;
  let origin: { parent: Node; next: Node | null } | undefined;
  const instance = Sortable.create(node, {
    group: "board",
    animation: 150,
    // カードの中のボタンを押してもドラッグを始めず、クリックはそのまま通す
    filter: "button",
    preventOnFilter: false,
    onStart(event) {
      origin = { parent: event.from, next: event.item.nextSibling };
    },
    onEnd(event) {
      if (origin) {
        origin.parent.insertBefore(event.item, origin.next);
      }
      const drop = toDrop(event);
      if (drop) {
        options.onDrop(drop);
      }
    },
  });
  return {
    update(next) {
      options = next;
      node.dataset.status = next.status;
    },
    destroy() {
      instance.destroy();
    },
  };
};

function toDrop(event: Sortable.SortableEvent): Drop | undefined {
  const { item, from, to, oldIndex, newIndex } = event;
  const status = to.dataset.status as Status;
  // 着手中の中の並べ替えは、位置を持たない着手中への移動（design 8.6）になり、ほかの着手中を今日やるへ戻してしまうので何もしない
  const unchanged = from === to && (oldIndex === newIndex || status === "doing");
  if (newIndex === undefined || unchanged) {
    return undefined;
  }
  return { key: item.dataset.key ?? "", status, position: newIndex };
}
