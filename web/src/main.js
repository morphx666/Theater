import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { restoreAccent } from './lib/accent.js';

restoreAccent();

export default mount(App, { target: document.getElementById('app') });
