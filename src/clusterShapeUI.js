export function initClusterShapeUI(variants, onSelect) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);'
    + 'display:flex;gap:8px;font-family:monospace;font-size:11px;';

  const buttons = variants.map((name, i) => {
    const btn = document.createElement('button');
    btn.textContent = name.replace(/^cluster/, '').replace(/([A-Z])/g, ' $1').trim();
    btn.style.cssText = 'background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);'
      + 'border:1px solid rgba(255,255,255,0.15);padding:5px 12px;cursor:pointer;'
      + 'letter-spacing:0.08em;text-transform:uppercase;';
    btn.addEventListener('click', () => {
      buttons.forEach(b => { b.style.color = 'rgba(255,255,255,0.5)'; b.style.borderColor = 'rgba(255,255,255,0.15)'; });
      btn.style.color = '#fff';
      btn.style.borderColor = 'rgba(255,255,255,0.45)';
      onSelect(name);
    });
    el.appendChild(btn);
    return btn;
  });

  buttons[0].style.color = '#fff';
  buttons[0].style.borderColor = 'rgba(255,255,255,0.45)';
  document.body.appendChild(el);
}
