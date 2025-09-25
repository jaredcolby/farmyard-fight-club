import './style.css';
import './styles/mobile.css';
import { Game } from './game/Game';

const game = new Game();

window.addEventListener('load', () => {
  void game.start();
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}
