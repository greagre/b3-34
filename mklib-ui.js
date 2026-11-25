/* =========================================================
   b3-34 / mklib-ui.js — связка текстового формата с библиотекой

   Добавляет к панели «Программы»:
     «⇩ Текст»   — всю библиотеку одним читаемым файлом .txt
     «⇧ Из файла» — принимает и .json, и .txt; формат определяется
                    сам по первому символу файла

   Старое сохранение в JSON остаётся нетронутым: кнопка «⇩ В файл»
   работает как работала, файлы прежних версий читаются.

   Перед записью в библиотеку каждая программа проходит проверку
   обратимости (MKLIB.roundtrip): коды → текст → коды. Если хоть
   один шаг не сошёлся, программа всё равно добавляется, но в
   сообщении будет сказано, сколько таких и какие.
   ========================================================= */
(function () {
  'use strict';

  var LIB_KEY = 'mk-emulator/library';

  /* ---------- мелкие помощники ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(LIB_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function save(arr) {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function toast(text, kind, ms) {
    if (window.MKSHELF && window.MKSHELF.toast) window.MKSHELF.toast(text, kind, ms);
    else window.alert(text);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fmtShort(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function download(text, name, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 1000);
  }

  function noModule() {
    toast('Модуль текстового формата не загрузился.\nПроверь, что рядом лежит mklib.js', 'bad', 8000);
  }

  /* ---------- выгрузка библиотеки в текст ---------- */

  function exportText() {
    if (!window.MKLIB) { noModule(); return; }

    var list = load();
    if (!list.length) {
      toast('В библиотеке нет программ — сначала сохрани хоть одну', 'warn');
      return;
    }

    var text = window.MKLIB.libToText(list, { name: 'Мои программы', model: 'b3-34' });
    download(text, 'b3-34-library.txt');

    toast('Вся библиотека в одном файле\n' +
          'программ: ' + list.length + ' · b3-34-library.txt', 'ok', 7000);
  }

  /* ---------- импорт с определением формата ---------- */

  function mergeIntoLibrary(programs) {
    var arr = load();
    var added = 0, replaced = 0, renamed = [];
    var first = null;

    programs.forEach(function (p) {
      var entry = {
        name: p.name || 'Без названия',
        prog: p.prog.slice(),
        data: p.data || {},
        savedAt: p.savedAt || Date.now()
      };
      if (p.inputs && p.inputs.length) entry.inputs = p.inputs;
      if (p.note) entry.note = p.note;
      if (p.tags && p.tags.length) entry.tags = p.tags;
      if (p.layout) entry.layout = p.layout;
      if (p.src) entry.src = p.src;

      var idx = -1;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].name === entry.name) { idx = i; break; }
      }

      if (idx < 0) {
        arr.push(entry);
        added++;
      } else if (JSON.stringify(arr[idx].prog) === JSON.stringify(entry.prog)) {
        arr[idx] = entry;
        replaced++;
      } else {
        var alt = entry.name + ' · ' + fmtShort(entry.savedAt);
        var base = alt, s = 2;
        while (arr.some(function (x) { return x.name === alt; })) {
          alt = base + ' (' + s + ')';
          s++;
        }
        entry.name = alt;
        arr.push(entry);
        added++;
        renamed.push(alt);
      }

      if (!first) first = entry;
    });

    save(arr);
    return { first: first, added: added, replaced: replaced, renamed: renamed, total: arr.length };
  }

  function importFile(file) {
    if (!window.MKLIB) { noModule(); return; }

    var reader = new FileReader();
    reader.onerror = function () { toast('Не смог прочитать файл', 'bad'); };

    reader.onload = function () {
      var text = String(reader.result || '');
      var res = window.MKLIB.parseAny(text, file.name);

      if (!res.programs || !res.programs.length) {
        var why = (res.errors && res.errors.length)
          ? res.errors.slice(0, 3).join('\n')
          : 'В файле не нашёл ни одной программы';
        toast('Файл не разобран\n' + why, 'bad', 9000);
        return;
      }

      /* проверка: текст → коды должно совпасть шаг в шаг */
      var bad = [];
      res.programs.forEach(function (p) {
        var rt = window.MKLIB.roundtrip(p.prog);
        if (!rt.ok) {
          bad.push(p.name + (rt.at >= 0 ? ' · шаг ' + rt.at : ''));
        }
      });

      var got = mergeIntoLibrary(res.programs);

      if (got.first && window.MKUI && window.MKUI.loadProgram) {
        window.MKUI.loadProgram(got.first.prog, got.first.data, {
          num: null, title: got.first.name
        });
        var tab = document.querySelector('#tabs button[data-tab="code"]');
        if (tab) tab.click();
      }

      var lines = [];
      lines.push('Прочитано программ: ' + res.programs.length +
                 ' (' + (res.kind === 'json' ? 'JSON' : 'текстовый формат') + ')');
      lines.push('в библиотеке: +' + got.added +
                 (got.replaced ? ' · обновлено ' + got.replaced : '') +
                 ' · всего ' + got.total);
      if (got.renamed.length) lines.push('переименовано при совпадении имён: ' + got.renamed.length);
      if (bad.length) lines.push('не сошлось при проверке: ' + bad.slice(0, 3).join(', '));
      if (res.warnings && res.warnings.length) lines.push(res.warnings[0]);
      if (res.errors && res.errors.length) lines.push('замечаний в файле: ' + res.errors.length);

      toast(lines.join('\n'), bad.length ? 'warn' : 'ok', 9000);

      if (window.MKSHELF) { window.MKSHELF.close(); window.MKSHELF.open(); }
    };

    reader.readAsText(file, 'utf-8');
  }

  /* ---------- подключение к интерфейсу ---------- */

  function init() {
    var btnTxt = document.getElementById('shelfExportTxt');
    if (btnTxt) btnTxt.addEventListener('click', exportText);

    /* собственный приёмник файлов: свой, чтобы не зависеть от
       прежнего обработчика, который ждал только JSON */
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,.txt,application/json,text/plain';
    inp.hidden = true;
    document.body.appendChild(inp);

    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (f) importFile(f);
      inp.value = '';
    });

    /* перехватываем клик по «⇧ Из файла» до старого обработчика */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (!t.closest('#shelfImport')) return;
      e.preventDefault();
      e.stopPropagation();
      inp.click();
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.MKLIBUI = {
    exportText: exportText,
    importFile: importFile
  };
})();
