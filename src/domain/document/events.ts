import type { DayDocument } from "@/domain/document/body";

const EVENTS_KEY = /^events:\s*$/;
const LIST_ITEM = /^\s*- (.*)$/;
const QUOTED = /^(["'])(.*)\1$/;

/** frontmatter の `events` の各項目。予定としての解釈は schedule.ts が行う */
export function eventLines(doc: DayDocument): string[] {
  // events がなければ start は -1 になり、先頭の `---` で読み終わる
  const start = doc.frontmatter.findIndex((line) => EVENTS_KEY.test(line.text));
  const items: string[] = [];
  for (const line of doc.frontmatter.slice(start + 1)) {
    const item = LIST_ITEM.exec(line.text)?.[1];
    if (item === undefined) {
      break;
    }
    items.push(unquote(item));
  }
  return items;
}

function unquote(value: string): string {
  return QUOTED.exec(value)?.[2] ?? value;
}
