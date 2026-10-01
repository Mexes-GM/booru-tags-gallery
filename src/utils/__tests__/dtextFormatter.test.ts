// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  formatDTextSafe,
  formatDTextAdvanced,
  formatPostCaption,
  sanitizeHtml,
} from '../dtextFormatter';

const formatters: Array<[string, (s: string) => string]> = [
  ['formatDTextSafe', formatDTextSafe],
  ['formatDTextAdvanced', (s: string) => formatDTextAdvanced(s)],
  ['formatPostCaption', formatPostCaption],
];

/** Parsea el HTML y comprueba que no haya vectores de ejecución */
const assertNoXss = (html: string) => {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const all = Array.from(doc.body.querySelectorAll('*'));
  for (const el of all) {
    expect(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'STYLE', 'SVG']).not.toContain(el.tagName);
    for (const attr of Array.from(el.attributes)) {
      expect(attr.name.toLowerCase().startsWith('on'), `handler ${attr.name} en <${el.tagName}>`).toBe(false);
      if (attr.name === 'href' || attr.name === 'src') {
        const v = attr.value.replace(/[\u0000- ]/g, '').toLowerCase();
        expect(v.startsWith('javascript:')).toBe(false);
        expect(v.startsWith('data:')).toBe(false);
        expect(v.startsWith('vbscript:')).toBe(false);
      }
    }
  }
  return doc;
};

const parse = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

describe('dtextFormatter XSS', () => {
  const payloads = [
    '<img src=x onerror=alert(1)>',
    '<script>alert(1)</script>',
    '"x":[javascript:alert(1)]',
    '"x":[JaVaScRiPt:alert(1)]',
    '"x":[ javascript:alert(1)]',
    '"x":[&#106;avascript:alert(1)]',
    '"x":[javascript&colon;alert(1)]',
    '"x":[data:text/html,<script>alert(1)</script>]',
    '"x":[vbscript:msgbox(1)]',
    '[x](javascript:alert(1))',
    '<javascript:alert(1)>',
    '[url=javascript:alert(1)]click[/url]',
    '[[foo" onmouseover="alert(1)]]',
    '[[foo" onmouseover="alert(1)|label]]',
    '{{foo" onmouseover="alert(1)}}',
    "{{foo' onmouseover='alert(1)}}",
    '[expand=<img src=x onerror=alert(1)>]body[/expand]',
    '[expand]<img src=x onerror=alert(1)>[/expand]',
    'h4. <img src=x onerror=alert(1)>',
    '* <img src=x onerror=alert(1)>',
    '[tn]<img src=x onerror=alert(1)>[/tn]',
    '[b]<svg onload=alert(1)>[/b]',
    'post #123: <img src=x onerror=alert(1)>',
    '"[1]":[#dtext-1]\n[1] javascript:alert(1)',
    '[table]\n<img src=x onerror=alert(1)> | b\n[/table]',
  ];

  for (const [name, fn] of formatters) {
    describe(name, () => {
      for (const p of payloads) {
        it(`neutraliza: ${p}`, () => {
          const out = fn(p);
          const doc = assertNoXss(out);
          // Ningún elemento real con handlers (el texto escapado dentro de atributos es inocuo)
          expect(doc.body.querySelector('[onerror],[onload],[onmouseover],[onclick]')).toBeNull();
          expect(out).not.toMatch(/href="\s*javascript:/i);
        });
      }
    });
  }

  it('formatDTextAdvanced escapa <img onerror> como texto', () => {
    const out = formatDTextAdvanced('<img src=x onerror=alert(1)>');
    const body = parse(out);
    expect(body.querySelector('img')).toBeNull();
    expect(body.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('formatDTextSafe no genera enlace javascript:', () => {
    const body = parse(formatDTextSafe('"x":[javascript:alert(1)]'));
    for (const a of Array.from(body.querySelectorAll('a'))) {
      expect(a.getAttribute('href') || '').not.toMatch(/javascript/i);
    }
  });

  it('el nombre del tag no rompe el atributo data-tag-name', () => {
    for (const fn of [formatDTextSafe, (s: string) => formatDTextAdvanced(s), formatPostCaption]) {
      const body = parse(fn('[[foo" onmouseover="alert(1)]]'));
      const a = body.querySelector('a.tag-link');
      expect(a).not.toBeNull();
      expect(a!.getAttribute('onmouseover')).toBeNull();
      expect(a!.getAttribute('data-tag-name')).toBe('foo"_onmouseover="alert(1)');

      const body2 = parse(fn('{{foo" onmouseover="alert(1)}}'));
      const a2 = body2.querySelector('a.tag-link');
      expect(a2).not.toBeNull();
      expect(a2!.getAttribute('onmouseover')).toBeNull();
    }
  });

  it('sanitizeHtml usa DOMPurify y aplica la política de URLs', () => {
    const out = sanitizeHtml(
      '<a href="javascript:alert(1)" onclick="x()">a</a><img src="data:image/png;base64,AAA" onerror="x()"><script>x()</script>' +
      '<a href="https://example.com" target="_blank">ok</a><a href="https://e.com" target="_top">t</a>'
    );
    const body = assertNoXss(out).body;
    expect(out).not.toContain('<script');
    const links = body.querySelectorAll('a');
    expect(links[0].hasAttribute('href')).toBe(false);
    expect(links[1].getAttribute('href')).toBe('https://example.com');
    expect(links[1].getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[2].hasAttribute('target')).toBe(false);
    expect(body.querySelector('img')!.hasAttribute('src')).toBe(false);
  });

  it('postImageMap con URL javascript: no se usa como src', () => {
    const out = formatDTextAdvanced('post #5', { 5: 'javascript:alert(1)' });
    assertNoXss(out);
    expect(out).not.toContain('javascript:');
  });
});

describe('dtextFormatter formato legítimo', () => {
  it('[[blue hair]] genera tag-link con data-tag-name (Safe y Advanced)', () => {
    for (const fn of [formatDTextSafe, (s: string) => formatDTextAdvanced(s), formatPostCaption]) {
      const body = parse(fn('See [[blue hair]] here'));
      const a = body.querySelector('a.tag-link') as HTMLAnchorElement;
      expect(a).not.toBeNull();
      expect(a.getAttribute('data-tag-name')).toBe('blue_hair');
      expect(a.getAttribute('href')).toBe('#');
      expect(a.textContent).toBe('blue hair');
      expect(a.className).toContain('cat-badge');
    }
  });

  it('[[page|texto]] y {{tag}}', () => {
    const body = parse(formatDTextAdvanced('[[long_hair|pelo largo]] and {{red_eyes}}'));
    const links = body.querySelectorAll('a.tag-link');
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('data-tag-name')).toBe('long_hair');
    expect(links[0].textContent).toBe('pelo largo');
    expect(links[1].getAttribute('data-tag-name')).toBe('red_eyes');
  });

  it('tags con & se preservan correctamente', () => {
    const body = parse(formatDTextAdvanced('[[black_&_white]]'));
    const a = body.querySelector('a.tag-link')!;
    expect(a.getAttribute('data-tag-name')).toBe('black_&_white');
    expect(a.textContent).toBe('black & white');
  });

  it('"link":https://example.com genera enlace externo seguro', () => {
    const cases: Array<[(s: string) => string, string]> = [
      [formatPostCaption, 'Visit "link":https://example.com now'],
      [formatDTextSafe, 'Visit "link":https://example.com now'],
      [formatDTextSafe, 'Visit "link":[https://example.com] now'],
    ];
    for (const [fn, input] of cases) {
      const body = parse(fn(input));
      const a = body.querySelector('a[href="https://example.com"]')!;
      expect(a).not.toBeNull();
      expect(a.textContent).toBe('link');
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('"texto":[https://...] en Advanced', () => {
    const body = parse(formatDTextAdvanced('"Pixiv":[https://www.pixiv.net/users/1?a=1&b=2]'));
    const a = body.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://www.pixiv.net/users/1?a=1&b=2');
    expect(a.textContent).toBe('Pixiv');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('<https://...> genera enlace en Safe', () => {
    const body = parse(formatDTextSafe('see <https://danbooru.donmai.us/wiki_pages/help>'));
    expect(body.querySelector('a[href="https://danbooru.donmai.us/wiki_pages/help"]')).not.toBeNull();
  });

  it('[b]bold[/b] y [i]italic[/i]', () => {
    for (const fn of [formatDTextSafe, (s: string) => formatDTextAdvanced(s), formatPostCaption]) {
      const body = parse(fn('[b]bold[/b] and [i]it[/i]'));
      expect(body.querySelector('strong')?.textContent).toBe('bold');
      expect(body.querySelector('em')?.textContent).toBe('it');
    }
  });

  it('[b] sin cerrar no deja texto basura', () => {
    const out = formatDTextAdvanced('[b]bold');
    expect(out).not.toContain('&lt;/b');
    expect(parse(out).querySelector('strong')?.textContent).toBe('bold');
  });

  it('post #123 genera badge con data-post-id (Advanced)', () => {
    const body = parse(formatDTextAdvanced('A good example is post #123 here.'));
    const badge = body.querySelector('[data-post-badge]')!;
    expect(badge).not.toBeNull();
    expect(badge.getAttribute('data-post-id')).toBe('123');
    expect(badge.textContent).toBe('Post #123');
  });

  it('post #123 genera enlace /posts/123 (Safe)', () => {
    const body = parse(formatDTextSafe('see post #123'));
    expect(body.querySelector('a[href="/posts/123"]')).not.toBeNull();
  });

  it('galería de posts con imagen en Advanced', () => {
    const out = formatDTextAdvanced('h4. Examples\n* post #7: [[cat_ears]]', { 7: 'https://cdn.donmai.us/x.jpg' });
    const body = parse(out);
    const img = body.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://cdn.donmai.us/x.jpg');
    expect(img.getAttribute('data-post-id')).toBe('7');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(body.querySelector('.media-gallery')).not.toBeNull();
    expect(body.querySelector('a.tag-link')?.getAttribute('data-tag-name')).toBe('cat_ears');
  });

  it('[expand] genera details/summary', () => {
    for (const fn of [formatDTextSafe, (s: string) => formatDTextAdvanced(s)]) {
      const body = parse(fn('[expand=More info]hidden [[blue hair]][/expand]'));
      const details = body.querySelector('details')!;
      expect(details).not.toBeNull();
      expect(details.querySelector('summary')?.textContent).toBe('More info');
    }
  });

  it('headers con id en Advanced', () => {
    const body = parse(formatDTextAdvanced('h4#about. About [[blue hair]]\nsome text here'));
    const h4 = body.querySelector('h4#about')!;
    expect(h4).not.toBeNull();
    expect(h4.querySelector('a.tag-link')).not.toBeNull();
  });

  it('texto con < > & se muestra literal', () => {
    const body = parse(formatDTextAdvanced('a < b && c > d'));
    expect(body.textContent).toContain('a < b && c > d');
  });
});
