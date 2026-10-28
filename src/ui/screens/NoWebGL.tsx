export const NO_WEBGL_COPY =
  'This game needs WebGL 2. Update your browser, or try Chrome, Edge, Firefox or Safari 16+.';

export function NoWebGL({ title }: { title: string }) {
  return (
    <main class="no-webgl" data-testid="app">
      <h1>{title}</h1>
      <p>{NO_WEBGL_COPY}</p>
    </main>
  );
}
