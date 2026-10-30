/** Shown in a second tab: only one tab may run the game, or their saves would collide. */
export function OtherTab({ title }: { title: string }) {
  return (
    <main class="no-webgl" data-testid="app">
      <h1>{title}</h1>
      <p>The game is open in another tab. Play there, or close it and reload this page.</p>
    </main>
  );
}
