/* =========================================================
   b3-34 / mklib.js — текстовый формат программы и библиотеки

   Один и тот же файл служит и записью ОДНОЙ программы,
   и выгрузкой ВСЕЙ библиотеки: программа — это блок,
   библиотека — несколько блоков подряд.

   ВИД ФАЙЛА
     ; комментарий, до конца строки
     @библиотека Мои программы
     @модель Б3-34
     @создано 2026-11-25T06:53:00.000Z

     == Площадь круга ==
     @теги геометрия
     @описание S = πr²
     @вход R1 = r
     @регистр 1 = 2
     @шаги
     П→X1 x² π × С/П

   КОМАНДЫ В ТЕКСТЕ (запись → код)
     0…9                              цифры            0x00…0x09
     .                                точка            0x0A
     /-/  ВП  Cx  В↑  Вx                                0x0B…0x0F
     +  -  ×  ÷  ↔                                      0x10…0x14
     10^x  e^x  lg  ln                                  0x15…0x18
     arcsin  arccos  arctg  sin  cos  tg                 0x19…0x1E
     π  √  x²  1/x  x^y  F◯                             0x20…0x25
     X→П0…X→Пd                                          0x40…0x4D
     С/П  В/О  НОП                                      0x50 0x52 0x54
     БП[NN]  ПП[NN]                                      0x51 0x53 + две цифры
     x≠0[NN] L2[NN] x≥0[NN] L3[NN]
     L1[NN] x<0[NN] L0[NN] x=0[NN]                       0x57…0x5E + две цифры
     П→X0…П→Xd                                          0x60…0x6D
     Кx≠0n КБПn Кx≥0n КППn
     КX→Пn Кx<0n КП→Xn Кx=0n                            0x70…0xED
     0xNN                             любой код напрямую

   Совместимость: понимаются имена из decoder.js с пробелом
   («X→П 1», «F x≠0») — пробел внутри такого имени убирается
   при разборе, ошибкой это не считается.

   ПРОВЕРКА ОБРАТИМОСТИ
     MKLIB.roundtrip(prog) — записывает коды в текст, читает
     обратно и сравнивает шаг за шагом. Если хоть один код
     не сошёлся, вернёт ok: false и место расхождения.

   Ничего не считает: только читает и пишет текст.
   ========================================================= */
(function (global) {
  'use strict';

  var NOP = 0x54;
  var REG = '0123456789abcd';
  var FORMAT = 1;

  /* --- простые команды: код → запись в тексте --- */
  var SIMPLE = {
    0x0B: '/-/', 0x0C: 'ВП', 0x0D: 'Cx', 0x0E: 'В↑', 0x0F: 'Вx',
    0x10: '+', 0x11: '-', 0x12: '×', 0x13: '÷', 0x14: '↔',
    0x15: '10^x', 0x16: 'e^x', 0x17: 'lg', 0x18: 'ln',
    0x19: 'arcsin', 0x1A: 'arccos', 0x1B: 'arctg', 0x1C: 'sin', 0x1D: 'cos', 0x1E: 'tg',
    0x20: 'π', 0x21: '√', 0x22: 'x²', 0x23: '1/x', 0x24: 'x^y', 0x25: 'F◯',
    0x50: 'С/П', 0x52: 'В/О', 0x54: 'НОП'
  };

  /* --- переходы и циклы: занимают три ячейки --- */
  var JUMPS = {
    0x51: 'БП', 0x53: 'ПП',
    0x57: 'x≠0', 0x58: 'L2', 0x59: 'x≥0', 0x5A: 'L3',
    0x5B: 'L1', 0x5C: 'x<0', 0x5D: 'L0', 0x5E: 'x=0'
  };

  /* --- косвенная адресация: старшая цифра кода → запись --- */
  var KINDS = {
    7: 'Кx≠0', 8: 'КБП', 9: 'Кx≥0', 10: 'КПП',
    11: 'КX→П', 12: 'Кx<0', 13: 'КП→X', 14: 'Кx=0'
  };

  /* обратный словарь, собирается один раз */
  var REV = null;

  function buildRev() {
    REV = {};
    Object.keys(SIMPLE).forEach(function (k) { REV[SIMPLE[k]] = +k; });

    for (var i = 0; i < 14; i++) {
      REV['X→П' + REG[i]] = 0x40 | i;
      REV['П→X' + REG[i]] = 0x60 | i;
      Object.keys(KINDS).forEach(function (hi) {
        REV[KINDS[hi] + REG[i]] = (+hi << 4) | i;
      });
    }
  }

  function hex2(c) {
    var s = (c & 255).toString(16).toUpperCase();
    return s.length < 2 ? '0' + s : s;
  }

  function pad2(n) { n = n | 0; return (n < 10 ? '0' : '') + n; }

  function isJump(c) { return JUMPS[c] !== undefined; }

  /* ---------- код → текст ---------- */

  function codeToToken(c) {
    c = c & 255;
    if (c >= 0 && c <= 9) return String(c);
    if (c === 0x0A) return '.';
    if (SIMPLE[c]) return SIMPLE[c];
    if (c >= 0x40 && c <= 0x4D) return 'X→П' + REG[c & 15];
    if (c >= 0x60 && c <= 0x6D) return 'П→X' + REG[c & 15];
    if (c >= 0x70 && c <= 0xED) {
      var hi = (c >> 4) & 15, lo = c & 15;
      if (KINDS[hi]) return KINDS[hi] + REG[lo];
    }
    return '0x' + hex2(c);
  }

  /* массив кодов → строка текста */
  function progToText(prog) {
    if (!Array.isArray(prog)) return '';
    var parts = [], num = '', i = 0;

    function flush() {
      if (num) { parts.push(num); num = ''; }
    }

    while (i < prog.length) {
      var c = prog[i] & 255;

      if (isJump(c)) {
        flush();
        var d1 = (prog[i + 1] === undefined) ? 0 : (prog[i + 1] & 255);
        var d2 = (prog[i + 2] === undefined) ? 0 : (prog[i + 2] & 255);
        parts.push(JUMPS[c] + '[' + d1 + '' + d2 + ']');
        i += 3;
        continue;
      }

      if ((c >= 0 && c <= 9) || c === 0x0A) {
        num += (c === 0x0A ? '.' : String(c));
        i++;
        continue;
      }

      flush();
      parts.push(codeToToken(c));
      i++;
    }

    flush();
    return parts.join(' ');
  }

  /* ---------- текст → коды ---------- */

  /* decoder.js пишет «X→П 1», «F x≠0» — убираем такой пробел */
  function glueNames(tok) {
    return String(tok)
      .replace(/^(X→П|П→X|КX→П|КП→X|Кx≠0|Кx≥0|Кx<0|Кx=0|КБП|КПП)\s+/u, '$1')
      .replace(/^F\s+(x≠0|x≥0|x<0|x=0)\s*/u, '$1');
  }

  function tokenToCodes(tok, lineNo, errors) {
    if (REV === null) buildRev();

    var t = glueNames(tok).trim();
    if (!t) return [];

    /* переход с адресом: БП[05], x≠0[12] */
    var mj = /^(БП|ПП|x≠0|x≥0|x<0|x=0|L0|L1|L2|L3)\[(\d)(\d)\]$/.exec(t);
    if (mj) {
      var base = {
        'БП': 0x51, 'ПП': 0x53,
        'x≠0': 0x57, 'L2': 0x58, 'x≥0': 0x59, 'L3': 0x5A,
        'L1': 0x5B, 'x<0': 0x5C, 'L0': 0x5D, 'x=0': 0x5E
      }[mj[1]];
      return [base, +mj[2], +mj[3]];
    }

    /* переход с адресом в виде одной строки адреса: «F L0 12» → L0[12] */
    var mj2 = /^(L[0-3])\[?(\d{1,2})\]?$/.exec(t);
    if (mj2 && t.indexOf('[') < 0) {
      var v = ('0' + mj2[2]).slice(-2);
      return [0x50 | ({ 'L0': 0x0D, 'L1': 0x0B, 'L2': 0x08, 'L3': 0x0A }[mj2[1]]), +v[0], +v[1]];
    }

    /* любой код напрямую */
    var mh = /^0x([0-9a-fA-F]{1,2})$/.exec(t);
    if (mh) return [parseInt(mh[1], 16)];

    /* число: только цифры и точка */
    if (/^[0-9.]+$/.test(t)) {
      var out = [], dot = false;
      for (var i = 0; i < t.length; i++) {
        var ch = t.charAt(i);
        if (ch === '.') {
          if (dot) { errors.push('строка ' + lineNo + ': в числе «' + t + '» две точки'); return null; }
          dot = true;
          out.push(0x0A);
        } else {
          out.push(+ch);
        }
      }
      return out;
    }

    /* имя команды из словаря */
    if (REV[t] !== undefined) return [REV[t]];

    errors.push('строка ' + lineNo + ': не знаю команду «' + tok + '»');
    return null;
  }

  /* строка с командами → коды */
  function lineToCodes(line, lineNo, errors) {
    var toks = String(line).split(/[\s,]+/).filter(function (s) { return s.length > 0; });
    var codes = [];
    for (var i = 0; i < toks.length; i++) {
      var c = tokenToCodes(toks[i], lineNo, errors);
      if (c) codes = codes.concat(c);
    }
    return codes;
  }

  /* ---------- разбор текста ---------- */

  function parseText(text) {
    var src = String(text || '').replace(/^\uFEFF/, '');
    var lines = src.split(/\r?\n/);
    var errors = [];
    var warnings = [];
    var lib = { name: 'Мои программы', model: 'b3-34', created: '', programs: [] };
    var cur = null;

    function startProgram(name) {
      cur = { name: name || 'Без названия', prog: [], data: {}, tags: [], note: '', inputs: [] };
      lib.programs.push(cur);
    }

    for (var n = 0; n < lines.length; n++) {
      var lineNo = n + 1;
      var line = lines[n].replace(/\s+$/, '');
      var t = line.trim();

      if (!t) continue;
      if (t.charAt(0) === ';') continue;

      /* «== имя ==» открывает новую программу */
      if (t.indexOf('==') === 0) {
        startProgram(t.replace(/^=+/, '').replace(/=+$/, '').trim());
        continue;
      }

      /* «@свойство значение» */
      if (t.charAt(0) === '@') {
        var sp = t.indexOf(' ');
        var key = (sp < 0 ? t.slice(1) : t.slice(1, sp)).toLowerCase();
        var val = sp < 0 ? '' : t.slice(sp + 1).trim();

        if (key === 'библиотека') { lib.name = val || lib.name; continue; }
        if (key === 'модель') { lib.model = val || lib.model; continue; }
        if (key === 'создано') { lib.created = val; continue; }
        if (key === 'формат') {
          if (val && +val > FORMAT) warnings.push('файл записан форматом ' + val + ', а я знаю ' + FORMAT + ' — лишние свойства пропущу');
          continue;
        }

        if (!cur) {
          errors.push('строка ' + lineNo + ': «@' + key + '» стоит до первой программы — начни её строкой «== имя ==»');
          continue;
        }

        if (key === 'теги') {
          cur.tags = val.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          continue;
        }
        if (key === 'описание') { cur.note = val; continue; }
        if (key === 'вход') { if (val) cur.inputs.push(val); continue; }
        if (key === 'источник') { cur.src = val; continue; }
        if (key === 'шаги') continue;

        if (key === 'регистр') {
          var mr = /^([0-9a-d])\s*=\s*(.+)$/i.exec(val);
          if (!mr) { errors.push('строка ' + lineNo + ': жду «@регистр 1 = 2», а вижу «' + val + '»'); continue; }
          var idx = REG.indexOf(mr[1].toLowerCase());
          var num = parseFloat(String(mr[2]).replace(',', '.'));
          if (isNaN(num)) { errors.push('строка ' + lineNo + ': в «@регистр» не число: «' + mr[2] + '»'); continue; }
          cur.data[idx] = num;
          continue;
        }

        errors.push('строка ' + lineNo + ': не знаю свойство «@' + key + '»');
        continue;
      }

      /* всё остальное — команды */
      if (!cur) {
        errors.push('строка ' + lineNo + ': команды стоят до первой программы — начни её строкой «== имя ==»');
        continue;
      }

      cur.prog = cur.prog.concat(lineToCodes(t, lineNo, errors));
    }

    /* пустые блоки — предупреждение, а не ошибка */
    lib.programs.forEach(function (p) {
      if (!p.prog.length) warnings.push('«' + p.name + '»: в блоке нет ни одной команды — пропущу');
    });
    lib.programs = lib.programs.filter(function (p) { return p.prog.length > 0; });

    return {
      ok: errors.length === 0 && lib.programs.length > 0,
      kind: 'text',
      lib: lib,
      programs: lib.programs,
      errors: errors,
      warnings: warnings
    };
  }

  /* ---------- запись ---------- */

  function stamp() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
           'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function programToText(p) {
    var out = [];
    out.push('== ' + (p.name || 'Без названия') + ' ==');

    if (p.tags && p.tags.length) out.push('@теги ' + p.tags.join(', '));
    if (p.note) out.push('@описание ' + p.note);
    (p.inputs || []).forEach(function (s) { out.push('@вход ' + s); });
    if (p.src) out.push('@источник ' + String(p.src).replace(/\s+/g, ' ').slice(0, 120));

    Object.keys(p.data || {}).forEach(function (k) {
      var v = p.data[k];
      if (typeof v === 'number' && isFinite(v) && v !== 0) {
        out.push('@регистр ' + REG[+k] + ' = ' + v);
      }
    });

    out.push('@шаги');
    out.push(progToText(p.prog || []));
    return out.join('\n');
  }

  function libToText(list, opts) {
    opts = opts || {};
    var out = [];
    out.push('; МК-библиотека · формат ' + FORMAT);
    out.push('; файл читается и правится в блокноте');
    out.push('@библиотека ' + (opts.name || 'Мои программы'));
    out.push('@модель ' + (opts.model || 'b3-34'));
    out.push('@создано ' + stamp());
    out.push('');

    (list || []).forEach(function (p) {
      out.push(programToText(p));
      out.push('');
    });

    return out.join('\n');
  }

  /* ---------- определение формата ---------- */

  function detect(text) {
    var t = String(text || '').replace(/^\uFEFF/, '').replace(/^\s+/, '');
    if (!t) return 'empty';
    if (t.charAt(0) === '{' || t.charAt(0) === '[') return 'json';
    return 'text';
  }

  /* ---------- JSON: чтение с миграцией старых полей ---------- */

  function jsonToPrograms(obj) {
    var out = [];
    if (!obj) return out;

    var list = [];
    if (Array.isArray(obj)) list = obj;
    else if (Array.isArray(obj.programs)) list = obj.programs;
    else if (Array.isArray(obj.prog)) list = [obj];

    var fileSaved = obj && obj.saved ? obj.saved : '';

    list.forEach(function (p) {
      if (!p || typeof p !== 'object') return;

      /* старые имена полей → текущие */
      var prog = Array.isArray(p.prog) ? p.prog
               : Array.isArray(p.cells) ? p.cells
               : Array.isArray(p.code) ? p.code
               : null;
      if (!prog || !prog.length) return;

      var data = p.data;
      if (!data && p.regs && typeof p.regs === 'object') data = p.regs;
      if (!data && p.registers && typeof p.registers === 'object') data = p.registers;

      var entry = {
        name: String(p.name || p.title || 'Без названия'),
        prog: prog.map(function (v) { return (typeof v === 'number' ? v : 0) & 255; }),
        data: {}
      };

      if (data && typeof data === 'object') {
        Object.keys(data).forEach(function (k) {
          var idx = REG.indexOf(String(k).toLowerCase());
          if (idx >= 0 && typeof data[k] === 'number') entry.data[idx] = data[k];
        });
      }

      var when = p.savedAt || (fileSaved ? Date.parse(fileSaved) : 0) || 0;
      if (when) entry.savedAt = when;
      if (p.layout) entry.layout = p.layout;
      if (p.inputs) entry.inputs = p.inputs;
      if (p.input) entry.inputs = [p.input];
      if (p.src) entry.src = p.src;
      if (p.note) entry.note = p.note;
      if (p.tags) entry.tags = p.tags;

      out.push(entry);
    });

    return out;
  }

  /* ---------- единая точка входа для файла ---------- */

  function parseAny(text, fileName) {
    var kind = detect(text);

    if (kind === 'empty') {
      return { ok: false, kind: 'empty', programs: [], errors: ['Файл пустой'], warnings: [] };
    }

    if (kind === 'json') {
      var obj;
      try { obj = JSON.parse(text); }
      catch (e) {
        return { ok: false, kind: 'json', programs: [], errors: ['Это не JSON: ' + e.message], warnings: [] };
      }
      var list = jsonToPrograms(obj);
      return {
        ok: list.length > 0,
        kind: 'json',
        programs: list,
        errors: list.length ? [] : ['В файле не нашёл программ (ждал programs[] или prog[])'],
        warnings: [],
        saved: (obj && obj.saved) || ''
      };
    }

    var r = parseText(text);
    r.fileName = fileName || '';
    return r;
  }

  /* ---------- проверка обратимости ---------- */

  function roundtrip(prog) {
    var text = progToText(prog);
    var errors = [];
    var back = lineToCodes(text, 1, errors);
    var src = (prog || []).map(function (v) { return v & 255; });

    var ok = !errors.length && back.length === src.length;
    var at = -1;

    if (ok) {
      for (var i = 0; i < src.length; i++) {
        if (src[i] !== back[i]) { ok = false; at = i; break; }
      }
    }

    return {
      ok: ok,
      text: text,
      back: back,
      len: src.length,
      at: at,
      want: at >= 0 ? src[at] : null,
      got: at >= 0 ? back[at] : null,
      errors: errors
    };
  }

  /* ---------- экспорт ---------- */

  global.MKLIB = {
    FORMAT: FORMAT,
    progToText: progToText,
    lineToCodes: lineToCodes,
    parseText: parseText,
    parseAny: parseAny,
    detect: detect,
    libToText: libToText,
    programToText: programToText,
    jsonToPrograms: jsonToPrograms,
    roundtrip: roundtrip,
    codeToToken: codeToToken,
    stamp: stamp
  };
})(typeof window !== 'undefined' ? window : this);
