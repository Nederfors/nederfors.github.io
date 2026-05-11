/* ===========================================================
   js/store.js
   • Ett enda, centralt hjälpbibliotek för data­lagring
   • Hanterar roll­personer, valda förmågor, inventarie
   • XP-beräkning enligt dina regler
   =========================================================== */
(function (global) {
  const STORAGE_KEY = 'rpall';

  /* ---------- 1. Grund­struktur ---------- */
  function emptyStore() {
    return {
      current: '',          // id för vald karaktär
      characters: [],       // [{ id, name }]
      data: {}              // { [charId]: { list: [...], inventory: [...] } }
    };
  }

  /* ---------- 2. Load / Save ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : emptyStore();
      // säkerställ nödvändiga fält
      return { ...emptyStore(), ...parsed };
    } catch {
      return emptyStore();
    }
  }

  function save(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  /* ---------- 3. Förmåge­lista per karaktär ---------- */
  function getCurrentList(store) {
    return store.current
      ? (store.data[store.current]?.list || [])
      : [];
  }

  function setCurrentList(store, list) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].list = list;
    save(store);
  }

  /* ---------- 4. Inventarie­funktioner ---------- */
  function getInventory(store) {
    return store.current
      ? (store.data[store.current]?.inventory || [])
      : [];
  }

  function setInventory(store, inv) {
    if (!store.current) return;
    store.data[store.current] = store.data[store.current] || {};
    store.data[store.current].inventory = inv;
    save(store);
  }

  /* ---------- 5. XP-beräkning ---------- */
  const XP_LADDER = { Novis: 10, Gesäll: 30, Mästare: 60 };

  function calcXP(list) {
    let xp = 0;

    list.forEach(item => {
      const types = (item.taggar?.typ || []).map(t => t.toLowerCase());

      // Förmågor/Mystisk kraft/Särdrag med nivåer
      if (item.nivåer && ['mystisk kraft','förmåga','särdrag']
          .some(t => types.includes(t))) {
        xp += XP_LADDER[item.nivå || 'Novis'] || 0;
      }

      // Ritual / Fördel / Nackdel plattar på eller drar av
      if (types.includes('ritual'))   xp += 10;
      if (types.includes('fördel'))   xp += 5;
      if (types.includes('nackdel'))  xp -= 5;
    });

    return xp;
  }

  /* ---------- 6. Exportera ---------- */
  global.storeHelper = {
    load,
    save,
    getCurrentList,
    setCurrentList,
    getInventory,
    setInventory,
    calcXP
  };
})(window);
