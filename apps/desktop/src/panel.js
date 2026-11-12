// The pop-up in the corner of the screen: the jobs printing now, and the
// "turn the pages over" step for printers that can't print both sides alone.

const LABEL = {
  waiting: 'Waiting for the printer',
  downloading: 'Getting the file',
  printing: 'Printing',
  flip: 'Turn the pages over',
  printed: 'Printed',
  failed: 'Not printed',
};

const list = document.getElementById('jobs');
const title = document.getElementById('title');
document.getElementById('close').onclick = () => window.panel.hide();

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function describe(j) {
  if (j.photo) return `Passport photos · ${j.copies} sheet${j.copies === 1 ? '' : 's'}`;
  const bits = [`${j.pages} page${j.pages === 1 ? '' : 's'}`, `${j.copies} cop${j.copies === 1 ? 'y' : 'ies'}`, j.color ? 'Colour' : 'B/W'];
  if (j.duplex) bits.push('Both sides');
  return bits.join(' · ');
}

window.panel.onJobs((jobs) => {
  const flipping = jobs.filter((j) => j.status === 'flip').length;
  const active = jobs.filter((j) => !['printed', 'failed'].includes(j.status)).length;
  title.textContent = flipping ? 'Turn the pages over' : active ? (active === 1 ? '1 job printing' : `${active} jobs printing`) : 'Prints';
  list.replaceChildren(
    ...jobs.map((j) => {
      const li = el('li', j.status === 'flip' ? 'alert' : '');
      li.onclick = () => window.panel.open();
      li.append(el('div', 'code', j.pickup));
      const body = el('div', 'body');
      body.append(el('div', 'name', j.photo ? 'Passport photos' : j.name), el('div', 'meta', `${describe(j)} · ${j.printer}`));
      const state = el('div', `state ${j.status}`);
      state.append(el('i'), el('span', '', LABEL[j.status] || j.status));
      body.append(state);
      if (j.error) body.append(el('div', 'note', j.error));
      if (j.status === 'flip') {
        const go = el('button', 'go', 'Print back sides');
        go.onclick = (e) => {
          e.stopPropagation();
          go.disabled = true;
          go.textContent = 'Starting…';
          window.panel.flip(j.id);
        };
        body.append(go);
      }
      li.append(body);
      return li;
    }),
  );
  window.panel.resize(document.getElementById('box').offsetHeight);
});
