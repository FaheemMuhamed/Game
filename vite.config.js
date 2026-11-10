// Settings for Vite, the tool that runs and builds the game.
import { defineConfig } from 'vite';

export default defineConfig({
  // './' makes the built game look for its files next to index.html,
  // so it works at any address, including username.github.io/repo-name/.
  base: './',
});
