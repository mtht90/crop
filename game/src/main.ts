import './style.css';
import { App } from './app';
import { AnimViewer } from './viewer';

const root = document.getElementById('app')!;
if (new URLSearchParams(location.search).has('viewer')) new AnimViewer(root);
else {
  const app = new App(root);
  if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
}
