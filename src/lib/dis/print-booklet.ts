/** Isolated A4 page using one geometric transform of the actual digital table. */
export function printBooklet(
  table: HTMLTableElement,
  heading: { train: string; route: string; carrier: string; validity: string; notes: string[] },
  preview = false,
) {
  document.querySelectorAll('.zcp-print-page,.zcp-print-style').forEach((e) => e.remove());
  const width = table.getBoundingClientRect().width,
    height = table.getBoundingClientRect().height;
  if (!width) throw new Error('Najprv zobrazte zošitový cestovný poriadok.');
  const clone = table.cloneNode(true) as HTMLTableElement;
  const original = [table, ...table.querySelectorAll('*')],
    copies = [clone, ...clone.querySelectorAll('*')];
  original.forEach((node, i) => {
    const style = getComputedStyle(node);
    for (const property of style)
      (copies[i] as HTMLElement).style.setProperty(
        property,
        style.getPropertyValue(property),
        'important',
      );
    copies[i].removeAttribute('id');
  });
  const scale = Math.min(1, (182 * 96) / 25.4 / width);
  const rowHeights = [...table.tBodies[0].rows].map(
    (row) => row.getBoundingClientRect().height * scale,
  );
  const headerHeight = (table.tHead?.getBoundingClientRect().height || 0) * scale;
  const groups: number[][] = [[]];
  let used = headerHeight;
  const noteLines = heading.notes.reduce(
    (sum, line) =>
      sum + line.split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / 75)), 0),
    0,
  );
  const availableHeight = Math.max(180, Math.min(700, 900 - (6 + noteLines) * 22));
  rowHeights.forEach((h, i) => {
    if (used + h > availableHeight && groups.at(-1)!.length) {
      groups.push([]);
      used = headerHeight;
    }
    groups.at(-1)!.push(i);
    used += h;
  });
  const pages: HTMLElement[] = [];
  groups.forEach((group, pageIndex) => {
    const page = document.createElement('article');
    page.className = 'zcp-print-page';
    const add = (tag: string, text: string, parent: HTMLElement = page) => {
      const e = document.createElement(tag);
      e.textContent = text;
      parent.append(e);
      return e;
    };
    const header = add('header', '');
    add('h1', heading.train, header);
    add('h2', heading.route, header);
    add('p', `Dopravca: ${heading.carrier}\n${heading.validity}`, header);
    const notes = add('div', '');
    notes.className = 'zcp-print-notes';
    heading.notes.forEach((note) => add('div', note, notes));
    const frame = add('div', '');
    frame.className = 'zcp-print-table';
    frame.style.height =
      Math.min(
        height * scale,
        headerHeight + group.reduce((sum, i) => sum + rowHeights[i], 0) + 5,
      ) + 'px';
    const pageTable = clone.cloneNode(true) as HTMLTableElement;
    [...pageTable.tBodies[0].rows].forEach((row, i) => {
      if (!group.includes(i)) row.remove();
    });
    for (const element of [pageTable, pageTable.tBodies[0]])
      element.style.setProperty('height', 'auto', 'important');
    pageTable.style.setProperty('width', width + 'px', 'important');
    pageTable.style.setProperty('min-width', width + 'px', 'important');
    pageTable.style.setProperty('max-width', width + 'px', 'important');
    pageTable.style.setProperty('transform', `scale(${scale})`, 'important');
    pageTable.style.setProperty('transform-origin', 'top left', 'important');
    frame.append(pageTable);
    const footer = add('footer', '');
    const stamp = new Intl.DateTimeFormat('sk-SK', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'Europe/Bratislava',
    }).format(new Date());
    add('span', `Vygenerované: ${stamp}\n${heading.validity}`, footer);
    add('span', `Strana ${pageIndex + 1} / ${groups.length}`, footer);
    pages.push(page);
  });
  const style = document.createElement('style');
  style.className = 'zcp-print-style';
  style.textContent = `.zcp-print-page{display:none}@media print{@page{size:A4 portrait;margin:14mm}html,body{margin:0!important;padding:0!important;background:#fff!important;overflow:visible!important}body>*:not(.zcp-print-page){display:none!important}body>.zcp-print-page{display:block!important;position:relative;width:182mm;height:267mm;margin:0!important;padding:0!important;background:#fff;color:#000;font:11pt Arial;overflow:visible}.zcp-print-page header{text-align:center;margin:0 0 4mm}.zcp-print-page h1{font:700 20pt Arial;margin:0 0 2mm}.zcp-print-page h2{font:bold 11pt Arial;margin:0 0 3mm}.zcp-print-page p{font:11pt/1.5 Arial;white-space:pre-line;margin:0}.zcp-print-notes{font:11pt/1.4 Arial}.zcp-print-table{position:relative;overflow:visible;width:100%}.zcp-print-page footer{position:absolute;bottom:3mm;left:0;right:0;display:flex;justify-content:space-between;font:10pt/1.5 Arial;color:#808080;white-space:pre-line}.zcp-print-page *{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;
  document.head.append(style);
  style.textContent +=
    '@media print{.zcp-print-page{break-after:page}.zcp-print-page:last-of-type{break-after:auto}}';
  pages.forEach((page) => document.body.append(page));
  const cleanup = () => {
    pages.forEach((page) => page.remove());
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  if (preview) {
    style.textContent += style.textContent.replaceAll('@media print', '@media screen');
    style.textContent +=
      '@media screen{body{background:#b9c5cf!important;padding:24px!important}body>.zcp-print-page{width:210mm!important;height:297mm!important;padding:14mm!important;margin:0 auto 20px!important}.zcp-print-page footer{left:14mm!important;right:14mm!important;bottom:18mm!important}body>.zcp-preview-controls{display:flex!important;justify-content:center;gap:8px;padding:10px}.zcp-preview-controls button{font:13px Tahoma;padding:6px 10px;background:white;color:black;border:1px solid #789}}@media print{body>.zcp-preview-controls{display:none!important}}';
    const controls = document.createElement('div');
    controls.className = 'zcp-preview-controls zcp-print-page';
    controls.style.cssText = 'height:auto!important;min-height:0!important;padding:8px!important';
    const back = document.createElement('button');
    back.textContent = 'Späť na digitálny ZCP';
    back.onclick = () => {
      controls.remove();
      cleanup();
    };
    const print = document.createElement('button');
    print.textContent = 'Tlač / PDF';
    print.onclick = () => window.print();
    controls.append(back, print);
    document.body.insertBefore(controls, pages[0]);
    window.addEventListener('afterprint', () => controls.remove(), { once: true });
  } else window.print();
}
