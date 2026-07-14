// ──── HELPER FUNCTIONS - COLLAPSIBLE PANEL ───────────────────────────────────────


let _panel = null;

function _getPanel() {
  if (_panel) return _panel;
  _panel = document.createElement('div');
  _panel.style.cssText = 'position:fixed;top:12px;right:12px;display:flex;flex-direction:column;'
    + 'align-items:flex-end;gap:6px;font-family:monospace;font-size:11px;z-index:1000;';
  document.body.appendChild(_panel);
  return _panel;
}

function _optionStyle(active) {
  return 'display:block;width:100%;background:rgba(255,255,255,0.08);'
    + `color:${active ? '#fff' : 'rgba(255,255,255,0.5)'};`
    + `border:1px solid rgba(255,255,255,${active ? '0.45' : '0.15'});padding:5px 12px;cursor:pointer;`
    + 'letter-spacing:0.08em;text-transform:uppercase;text-align:right;font-family:monospace;font-size:11px;';
}

function _makeCollapsibleSection(title, items, current, onSelect) {
  const section = document.createElement('div');
  section.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:4px;';

  const header = document.createElement('button');
  header.textContent = title;
  header.style.cssText = 'background:rgba(0,0,0,0.4);color:rgba(255,255,255,0.7);'
    + 'border:1px solid rgba(255,255,255,0.2);padding:6px 12px;cursor:pointer;min-width:170px;'
    + 'letter-spacing:0.08em;text-transform:uppercase;text-align:right;font-family:monospace;font-size:11px;';

  const body = document.createElement('div');
  body.style.cssText = 'display:none;flex-direction:column;gap:4px;width:100%;';

  let expanded = false;
  header.addEventListener('click', () => {
    expanded = !expanded;
    body.style.display = expanded ? 'flex' : 'none';
  });

  const buttons = items.map(({ value, label }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = _optionStyle(value === current);
    btn.addEventListener('click', () => {
      buttons.forEach(b => { b.style.cssText = _optionStyle(false); });
      btn.style.cssText = _optionStyle(true);
      onSelect(value);
    });
    body.appendChild(btn);
    return btn;
  });

  section.appendChild(header);
  section.appendChild(body);
  _getPanel().appendChild(section);
}


// ──── SHAPES ──────────────────────────────────────────────────────────────────────


export function initClusterShapeUI(variants, onSelect) {
  const items = variants.map(name => ({
    value: name,
    label: name.replace(/^cluster/, '').replace(/([A-Z])/g, ' $1').trim(),
  }));
  _makeCollapsibleSection('SHAPES', items, variants[0], onSelect);
}


// ──── ENVIRONMENT MAP ─────────────────────────────────────────────────────────────


function _envMapItems(files) {
  return files.map(name => ({ value: name, label: name.replace(/\.[^.]+$/, '') }));
}

export function initClusterEnvMapUI(files, current, onSelect) {
  _makeCollapsibleSection('CLUSTER ENVIRONMENT', _envMapItems(files), current, onSelect);
}

export function initMetaballEnvMapUI(files, current, onSelect) {
  _makeCollapsibleSection('METABALL ENVIRONMENT', _envMapItems(files), current, onSelect);
}
