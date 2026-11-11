<script lang="ts">
import { dayFileNotice } from "@/app/messages";

interface Props {
  kind: "missing" | "unreadable";
  isToday: boolean;
}

const { kind, isToday }: Props = $props();
</script>

<!-- ボードと M3 で同じ知らせを出す（design M3）。Obsidian 本体の .message とぶつからない名前にする -->
<p class="day-notice">{dayFileNotice(kind, isToday)}</p>

<style>
.day-notice {
  margin: 0;
  color: var(--text-muted);
}
</style>
