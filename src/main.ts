import '../style.css';
import { Game } from './core/Game';
try {
  const root = document.querySelector<HTMLElement>('#game');
  if (!root) throw new Error('Game container is missing.');
  const game = new Game(root);
  if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
} catch (error: unknown) {
  const box = document.querySelector<HTMLElement>('#error');
  if (box) { box.classList.remove('hidden'); box.textContent = `The road couldn’t load. Please enable WebGL / hardware acceleration and reload. ${error instanceof Error ? error.message : String(error)}`; }
  console.error(error);
}
