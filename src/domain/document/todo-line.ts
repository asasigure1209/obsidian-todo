export type Status = "todo" | "doing" | "done";

export type Estimate = "小" | "1" | "2" | "3" | "4";

export interface TodoLine {
  status: Status;
  name: string;
  estimate?: Estimate;
}

const STATUS_BY_MARK: Record<string, Status> = { " ": "todo", "/": "doing", x: "done" };
const MARK_BY_STATUS: Record<Status, string> = { todo: " ", doing: "/", done: "x" };
const TODO_LINE = /^- \[([ /x])\] (.*?)(?: \[est:: (小|[1-4])\])?$/;

export function parseTodoLine(text: string): TodoLine | undefined {
  const match = TODO_LINE.exec(text);
  if (!match) {
    return undefined;
  }
  const [, mark = "", name = "", estimate] = match;
  if (name.trim() === "") {
    return undefined;
  }
  const status = STATUS_BY_MARK[mark] as Status;
  return estimate ? { status, name, estimate: estimate as Estimate } : { status, name };
}

export function formatTodoLine(todo: TodoLine): string {
  const estimate = todo.estimate ? ` [est:: ${todo.estimate}]` : "";
  return `- [${MARK_BY_STATUS[todo.status]}] ${todo.name}${estimate}`;
}
