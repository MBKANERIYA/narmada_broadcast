import { render } from 'preact';
import App from './App';
import './styles/main.css';

// SPEED: Preact is 3KB vs React's 45KB - same API, faster load
const root = document.getElementById('app');

// Fully unmount any existing Preact tree first, then clear DOM
render(null, root);
while (root.firstChild) root.removeChild(root.firstChild);

// Single clean render
render(<App />, root);
