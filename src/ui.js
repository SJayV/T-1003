import { setEnvPreset } from './environment.js';

export function initUI() {
  document.querySelectorAll('#env-ui button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#env-ui button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setEnvPreset(Number(btn.dataset.preset));
    });
  });
}
