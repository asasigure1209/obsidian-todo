<script lang="ts">
interface Props {
  dayKey: string;
}

const { dayKey }: Props = $props();
</script>

<div class="board">
  <h2>{dayKey} のボード</h2>
  <p>準備中</p>
</div>

<style>
.board {
  padding: var(--size-4-4);
  color: var(--text-normal);
}
</style>
