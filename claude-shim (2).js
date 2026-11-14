/* Переходник: даёт приложению те же вызовы claude.use("db" | "user" | "downloads"),
   но работает на Firebase (Firestore + вход по email/паролю). Код index.html не менялся. */
(function () {
  // ===== ВСТАВЬТЕ СВОИ ДАННЫЕ ИЗ FIREBASE (Project settings → Your apps → Config) =====
  var firebaseConfig = {
    apiKey: "ВСТАВЬТЕ",
    authDomain: "ВСТАВЬТЕ",
    projectId: "ВСТАВЬТЕ",
    appId: "ВСТАВЬТЕ"
  };
  // =====================================================================================

  firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var fs = firebase.firestore();
  fs.settings({ ignoreUndefinedProperties: true });

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
        }).catch(function () {
          b.disabled = false; r.textContent = "Неверный email или пароль";
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

  window.claude = {
    use: async function (name) {
      if (name === "db") {
        await ensureUser();
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
      // "mcp" (Google Диск через Claude) вне Claude недоступен — приложение само покажет «скачайте файл»
      throw new Error("not available: " + name);
    }
  };
})();
