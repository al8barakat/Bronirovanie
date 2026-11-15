/* Переходник: даёт приложению те же вызовы claude.use("db" | "user" | "downloads" | "mcp"),
   но работает на Firebase (Firestore + вход по email/паролю) и Google Apps Script.
   Код index.html не менялся. */
(function () {
  // ===== ВСТАВЬТЕ СВОИ ДАННЫЕ ИЗ FIREBASE (Project settings → Your apps → Config) =====
  var firebaseConfig = {
     apiKey: "AIzaSyAN0wSjpLMQqEiYm2yvfW142JHyTIa34bk",
    authDomain: "register-app-30f04.firebaseapp.com",
    projectId: "register-app-30f04",
    appId: "1:608203772826:web:49fd5b75e7efaa6a0de023"
  };
  // ===== АДРЕСА ВЕБ-ПРИЛОЖЕНИЙ GOOGLE (после «Deploy → Web app», см. README) =====
  var DRIVE_URL = "https://script.google.com/macros/s/AKfycbwBaYUZSdHquL54C9x_aOtxwwuBwpQjmjcyTnfAO3VKtexngexc_Ge5TqWoOsFkz_No/exec"; // скрипт 1: копии на Google Диск (drive-backup.gs)
  var SHEET_URL = "https://script.google.com/u/1/home/projects/1Fyyz8qQO1X6OI3oOmUn7iHOnyKnouwgj5wx98WO7hZBUYK6EQRsSM5fu/edit"; // скрипт 2: Google Таблица (sheet-sync.gs)
  // =====================================================================================

  function isSet(v) { return v && v.indexOf("ВСТАВЬТЕ") === -1; }

  firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var fs = firebase.firestore();
  fs.settings({ ignoreUndefinedProperties: true });

  function say(t) { try { if (window.toast) window.toast(t); } catch (e) {} }
  function z2(n) { return String(n).padStart(2, "0"); }

  /* ---------- вход ---------- */
  function showLogin() {
    return new Promise(function (resolve) {
      var ov = document.createElement("div");
      ov.style.cssText = "position:fixed;inset:0;z-index:1000;background:#0b1f18;display:flex;align-items:center;justify-content:center;padding:16px;font:15px -apple-system,'Segoe UI',Roboto,Arial,sans-serif";
      ov.innerHTML =
        '<div style="background:#fff;color:#1d2b25;border-radius:16px;padding:20px;max-width:360px;width:100%">' +
        '<h3 style="margin:0 0 10px">Брони · вход</h3>' +
        '<input id="shE" type="email" placeholder="Email" autocomplete="username" style="width:100%;padding:10px;margin-bottom:8px;border:1px solid #ddd6c6;border-radius:10px;font:inherit;box-sizing:border-box">' +
        '<input id="shP" type="password" placeholder="Пароль" autocomplete="current-password" style="width:100%;padding:10px;margin-bottom:8px;border:1px solid #ddd6c6;border-radius:10px;font:inherit;box-sizing:border-box">' +
        '<button id="shB" type="button" style="width:100%;padding:11px;border:0;border-radius:10px;background:#1f4e3d;color:#fff;font:inherit;font-weight:600;cursor:pointer">Войти</button>' +
        '<div id="shR" style="color:#b3261e;font-size:14px;margin-top:8px"></div></div>';
      document.body.appendChild(ov);
      var e = ov.querySelector("#shE"), p = ov.querySelector("#shP"), b = ov.querySelector("#shB"), r = ov.querySelector("#shR");
      function go() {
        r.textContent = ""; b.disabled = true;
        auth.signInWithEmailAndPassword(e.value.trim(), p.value).then(function (c) {
          ov.remove(); resolve(c.user);
        }).catch(function (err) {
          var c = (err && err.code) || "", m = {
            "auth/invalid-credential": "Такого пользователя нет в Firebase (Authentication → Users) или пароль не совпадает",
            "auth/wrong-password": "Пароль не совпадает с заданным в Firebase",
            "auth/user-not-found": "Такого email нет в Firebase (Authentication → Users)",
            "auth/invalid-email": "Неверный формат email",
            "auth/operation-not-allowed": "В Firebase не включён вход по Email/Password (Authentication → Sign-in method)",
            "auth/configuration-not-found": "В Firebase не запущен Authentication (кнопка Get started)",
            "auth/invalid-api-key": "Неверный apiKey в claude-shim.js",
            "auth/api-key-not-valid": "Неверный apiKey в claude-shim.js",
            "auth/network-request-failed": "Нет связи с Firebase (проверьте интернет)",
            "auth/too-many-requests": "Слишком много попыток, подождите несколько минут"
          };
          b.disabled = false;
          r.textContent = (m[c] || "Не удалось войти") + (c ? " [" + c + "]" : "");
        });
      }
      b.onclick = go;
      p.onkeydown = function (ev) { if (ev.key === "Enter") go(); };
    });
  }

  var userP = null;
  function ensureUser() {
    if (!userP) {
      userP = new Promise(function (resolve) {
        var off = auth.onAuthStateChanged(function (u) {
          off();
          if (u) resolve(u); else showLogin().then(resolve);
        });
      });
    }
    return userP;
  }

  /* ---------- отправка в Google Apps Script ---------- */
  async function post(url, payload) {
    var u = await ensureUser();
    payload.idToken = await u.getIdToken();
    var r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // без preflight
      body: JSON.stringify(payload)
    });
    return r.json();
  }

  function markBackupDone() { try { localStorage.setItem("adm_dl", String(Date.now())); } catch (e) {} }

  /* ---------- кнопки «Открыть смену» / «Закрыть смену» / «Обновить таблицу» ---------- */
  async function sendShift(kind, btn) {
    if (!isSet(DRIVE_URL)) { say("Не задан адрес скрипта Google Диска (DRIVE_URL)"); return; }
    btn.disabled = true;
    try {
      var d = new Date();
      var title = "Резерв броней Аль-Баракат · " + kind + " " + d.getFullYear() + "-" + z2(d.getMonth() + 1) + "-" + z2(d.getDate()) + " " + z2(d.getHours()) + "-" + z2(d.getMinutes());
      var j = await post(DRIVE_URL, { action: "backup", title: title, content: window.backupCsv() });
      if (!j.ok) throw new Error(j.error || "error");
      markBackupDone();
      say(kind + ": копия отправлена на Google Диск");
    } catch (e) {
      say("Не удалось отправить копию (" + (e.message || e) + ")");
    }
    btn.disabled = false;
  }

  async function sendFullSheet(btn) {
    if (!isSet(SHEET_URL)) { say("Не задан адрес скрипта Google Таблицы (SHEET_URL)"); return; }
    btn.disabled = true;
    try {
      var rows = (window.B || []).slice().map(function (b) { return rowOf(b, false); })
        .concat((window.D || []).slice().map(function (b) { return rowOf(b, true); }));
      var j = await post(SHEET_URL, { action: "full", rows: rows });
      if (!j.ok) throw new Error(j.error || "error");
      say("Таблица обновлена: строк " + rows.length);
    } catch (e) {
      say("Не удалось обновить таблицу (" + (e.message || e) + ")");
    }
    btn.disabled = false;
  }

  function addBar() {
    if (document.getElementById("shBar")) return;
    var bar = document.createElement("div");
    bar.id = "shBar";
    bar.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:900;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:calc(100vw - 20px)";
    function mk(text, fn) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = text;
      b.style.cssText = "padding:9px 12px;border:0;border-radius:999px;background:#1f4e3d;color:#fff;font:600 13px -apple-system,'Segoe UI',Roboto,Arial,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)";
      b.onclick = function () { fn(b); };
      bar.appendChild(b);
    }
    if (isSet(DRIVE_URL)) {
      mk("Открыть смену", function (b) { sendShift("Открытие смены", b); });
      mk("Закрыть смену", function (b) { sendShift("Закрытие смены", b); });
    }
    if (isSet(SHEET_URL)) mk("Обновить таблицу", sendFullSheet);
    if (bar.children.length) document.body.appendChild(bar);
  }

  /* ---------- Google Таблица: строка на каждую бронь ---------- */
  function fd(d) { var p = String(d || "").split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : (d || ""); }
  // та же раскладка колонок, что в CSV-копии приложения (backupCsv)
  function rowOf(b, deleted) {
    var pl = (b.places || []).filter(Boolean).concat(["", "", ""]);
    if (deleted) {
      return [fd(b.date), b.time || "", b.name || "", b.phone || "", b.guests || "", pl[0], pl[1], pl[2], "Удалена", "", "", "", "", "", "", b.note || "", "", "", "", "", "", b.deletedBy || "", b.deletedReason || "", b.msg || "", b.id || ""];
    }
    var pr = b.prepay || {}, c = b.cancel || {}, live = b.status !== "cancelled";
    var st = live ? (b.confirmed ? "Подтверждена" : "Новая") : "Отмена";
    return [fd(b.date), b.time || "", b.name || "", b.phone || "", b.guests || "", pl[0], pl[1], pl[2], st,
      (b.confirmed && live) ? "Да" : "Нет", b.preorder ? "Да" : "Нет", pr.need || "", pr.paid ? "Да" : (pr.need ? "Нет" : ""),
      pr.method || "", pr.to || "", b.note || "", b.createdBy || "", b.updatedBy || "", b.exportedAt ? "Да" : "Нет",
      c.by || "", c.reason || "", "", "", b.msg || "", b.id || ""];
  }

  var queue = [], timer = null;
  function flush() {
    timer = null;
    var ops = queue; queue = [];
    if (!ops.length) return;
    post(SHEET_URL, { action: "ops", ops: ops }).then(function (j) {
      if (!j.ok) throw new Error(j.error || "error");
    }).catch(function (e) {
      say("Таблица не обновилась (" + (e.message || e) + ") — нажмите «Обновить таблицу»");
    });
  }
  function push(op) {
    queue.push(op);
    if (!timer) timer = setTimeout(flush, 1500); // собираем пачкой
  }

  var syncOn = false;
  function startSheetSync() {
    if (syncOn || !isSet(SHEET_URL)) return;
    syncOn = true;
    var first = true;
    fs.collection("bookings").onSnapshot(function (snap) {
      if (first) { first = false; return; } // первый снимок — старые данные, не отправляем
      snap.docChanges().forEach(function (ch) {
        var id = ch.doc.id;
        if (ch.type === "removed") { push({ op: "remove", id: id }); return; }
        // отправляем только изменения, сделанные с этого устройства, чтобы не было дублей
        if (!ch.doc.metadata.hasPendingWrites) return;
        var b = ch.doc.data(); b.id = id;
        push({ op: "upsert", id: id, row: rowOf(b, false) });
      });
    }, function () {});
  }

  /* ---------- то, что видит приложение ---------- */
  window.claude = {
    use: async function (name) {
      if (name === "db") {
        await ensureUser();
        addBar();
        startSheetSync();
        return {
          collection: function (c) { return fs.collection(c); },
          doc: function (path) {
            var ref = fs.doc(path);
            // Блокировка: в Claude была встроенная, здесь делаем через транзакцию Firestore
            ref.acquire = function (o) {
              return fs.runTransaction(function (t) {
                return t.get(ref).then(function (s) {
                  var now = Date.now();
                  if (s.exists) {
                    var d = s.data();
                    if (d.expires > now && d.holder !== o.holder) return { acquired: false };
                  }
                  t.set(ref, { holder: o.holder, expires: now + (o.ttlMs || 6000) });
                  return { acquired: true };
                });
              });
            };
            return ref;
          }
        };
      }
      if (name === "user") { var u = await ensureUser(); return { id: async function () { return u.uid; } }; }
      if (name === "downloads") {
        return {
          save: async function (o) {
            var bom = /\.(tsv|csv)$/i.test(o.filename) ? "\ufeff" : "";
            var blob = new Blob([bom + o.data], { type: "text/plain;charset=utf-8" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = o.filename;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
          }
        };
      }
      if (name === "mcp") {
        if (!isSet(DRIVE_URL)) throw new Error("not configured");
        // Кнопка «Отправить копию на Google Диск» вызывает именно это
        return {
          callTool: async function (server, tool, inp) {
            if (tool !== "create_file") throw { code: "unsupported_tool" };
            var j = await post(DRIVE_URL, { action: "backup", title: inp.title, content: inp.textContent, folderId: inp.parentId || "" });
            if (!j.ok) throw { code: j.error || "error" };
            return j;
          }
        };
      }
      throw new Error("not available: " + name);
    }
  };
})();
