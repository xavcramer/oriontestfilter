import React, { useEffect, useMemo, useState } from "react";
import "./App.css"

const API = "http://localhost:4000";

const toStrArray = (arr) => (arr || []).map(String);

export default function App() {
  // справочники
  const [departures, setDepartures] = useState([]);
  const [countries, setCountries] = useState([]);
  const [mealPlans, setMealPlans] = useState([]);
  const [resorts, setResorts] = useState([]);
  const [hotels, setHotels] = useState([]);

  // результаты
  const [data, setData] = useState({ items: [], total: 0, page: 1, pageSize: 12 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // состояние фильтра
  const [form, setForm] = useState({
    fromId: "",
    countryId: "",
    dateFrom: "",
    dateTo: "",
    nightsMin: "7",
    nightsMax: "14",
    adults: "1",
    children: "0",
    starsMin: "",
    mealPlanId: "",
    priceMin: "0",
    priceMax: "1000000",
    currency: "rub",
    resortIds: [],
    hotelIds: [],
    withFlight: false,
    availableOnly: false,
    sort: "price_asc",
    page: 1,
    pageSize: 12,
  });

  // параметры для POST /api/tours/search
  const searchBody = useMemo(() => {
    return {
      ...form,
      resortIds: toStrArray(form.resortIds),
      hotelIds: toStrArray(form.hotelIds),
      page: Number(form.page) || 1,
      pageSize: Number(form.pageSize) || 12,
    };
  }, [form]);

  async function fetchJson(url, options) {
    const r = await fetch(url, options);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  // ---- загрузка справочников (GET) ----
  async function loadMeta() {
    const [deps, cnts, meals] = await Promise.all([
      fetchJson(`${API}/api/meta/departures`),
      fetchJson(`${API}/api/meta/countries`),
      fetchJson(`${API}/api/meta/meal-plans`),
    ]);
    setDepartures(deps);
    setCountries(cnts);
    setMealPlans(meals);
  }

  async function loadResorts(countryId) {
    const url = new URL(`${API}/api/meta/resorts`);
    if (countryId) url.searchParams.set("countryId", countryId);
    const rs = await fetchJson(url);
    setResorts(rs);
  }

  // ---- отели (POST) ----
  async function loadHotels(resortIdsArr) {
    const hs = await fetchJson(`${API}/api/meta/hotels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resortIds: resortIdsArr }),
    });
    setHotels(hs);
  }

  // ---- туры (POST) ----
  async function searchTours(body) {
    return fetchJson(`${API}/api/tours/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // init
  useEffect(() => {
    loadMeta().catch(() => setError("Не удалось загрузить справочники. Проверь backend."));
  }, []);

  // resorts when country changes
  useEffect(() => {
    loadResorts(form.countryId).catch(() => setError("Не удалось загрузить курорты."));
  }, [form.countryId]);

  // hotels when resorts change
  useEffect(() => {
    loadHotels(form.resortIds).catch(() => setError("Не удалось загрузить отели."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.resortIds.join(",")]);

  // первая загрузка списка (без нажатия)
  useEffect(() => {
    handleSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch(nextPage) {
    setLoading(true);
    setError("");
    try {
      const body = { ...searchBody, page: nextPage || 1 };

      // если страна не выбрана — не фильтруем по курортам/отелям
      if (!body.countryId) {
        body.resortIds = [];
        body.hotelIds = [];
      }

      const res = await searchTours(body);
      setData(res);
      setForm((p) => ({ ...p, page: res.page }));
    } catch (e) {
      console.error(e);
      setError("Ошибка загрузки туров. Проверь backend и БД.");
    } finally {
      setLoading(false);
    }
  }

  function toggleId(listKey, id) {
    setForm((prev) => {
      const s = new Set(prev[listKey].map(String));
      const key = String(id);
      s.has(key) ? s.delete(key) : s.add(key);
      return { ...prev, [listKey]: Array.from(s), page: 1 };
    });
  }

  function onCountryChange(value) {
    setForm((p) => ({
      ...p,
      countryId: value,
      resortIds: [],
      hotelIds: [],
      page: 1,
    }));
  }

  function onResortToggle(id) {
    // при изменении курортов сбрасываем выбранные отели
    setForm((p) => ({ ...p, hotelIds: [], page: 1 }));
    toggleId("resortIds", id);
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="title">Поиск туров</div>
          <div className="subtitle">React fetch → Express (GET/POST) → PostgreSQL</div>
        </div>
        <div className="health">
          API: <span className="pill">{API}</span>
        </div>
      </header>

      <section className="filter-card">
        <div className="filter-grid">
          <div className="field">
            <label>Откуда</label>
            <select
              value={form.fromId}
              onChange={(e) => setForm((p) => ({ ...p, fromId: e.target.value, page: 1 }))}
            >
              <option value="">Выберите город</option>
              {departures.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Куда (страна)</label>
            <select value={form.countryId} onChange={(e) => onCountryChange(e.target.value)}>
              <option value="">Выберите страну</option>
              {countries.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Дата вылета с</label>
            <input
              type="date"
              value={form.dateFrom}
              onChange={(e) => setForm((p) => ({ ...p, dateFrom: e.target.value, page: 1 }))}
            />
          </div>

          <div className="field">
            <label>по</label>
            <input
              type="date"
              value={form.dateTo}
              onChange={(e) => setForm((p) => ({ ...p, dateTo: e.target.value, page: 1 }))}
            />
          </div>

          <div className="field inline">
            <label>Ночей</label>
            <div className="inline2">
              <div className="mini">
                <span>от</span>
                <input
                  type="number"
                  value={form.nightsMin}
                  onChange={(e) => setForm((p) => ({ ...p, nightsMin: e.target.value, page: 1 }))}
                />
              </div>
              <div className="mini">
                <span>до</span>
                <input
                  type="number"
                  value={form.nightsMax}
                  onChange={(e) => setForm((p) => ({ ...p, nightsMax: e.target.value, page: 1 }))}
                />
              </div>
            </div>
          </div>

          <div className="field inline">
            <label>Туристы</label>
            <div className="inline2">
              <div className="mini">
                <span>взр.</span>
                <input
                  type="number"
                  min="1"
                  value={form.adults}
                  onChange={(e) => setForm((p) => ({ ...p, adults: e.target.value, page: 1 }))}
                />
              </div>
              <div className="mini">
                <span>дет.</span>
                <input
                  type="number"
                  min="0"
                  value={form.children}
                  onChange={(e) => setForm((p) => ({ ...p, children: e.target.value, page: 1 }))}
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label>Категория (звезды от)</label>
            <select
              value={form.starsMin}
              onChange={(e) => setForm((p) => ({ ...p, starsMin: e.target.value, page: 1 }))}
            >
              <option value="">Любая</option>
              {[2, 3, 4, 5].map((s) => (
                <option key={s} value={s}>
                  {s}+
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Тип питания</label>
            <select
              value={form.mealPlanId}
              onChange={(e) => setForm((p) => ({ ...p, mealPlanId: e.target.value, page: 1 }))}
            >
              <option value="">Любой</option>
              {mealPlans.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} — {x.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field inline">
            <label>Стоимость</label>
            <div className="inline2">
              <div className="mini">
                <span>от</span>
                <input
                  type="number"
                  value={form.priceMin}
                  onChange={(e) => setForm((p) => ({ ...p, priceMin: e.target.value, page: 1 }))}
                />
              </div>
              <div className="mini">
                <span>до</span>
                <input
                  type="number"
                  value={form.priceMax}
                  onChange={(e) => setForm((p) => ({ ...p, priceMax: e.target.value, page: 1 }))}
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label>Валюта</label>
            <select
              value={form.currency}
              onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value, page: 1 }))}
            >
              <option value="rub">руб.</option>
              <option value="usd">у.е.</option>
            </select>
          </div>

          <div className="field">
            <label>Сортировка</label>
            <select
              value={form.sort}
              onChange={(e) => setForm((p) => ({ ...p, sort: e.target.value, page: 1 }))}
            >
              <option value="price_asc">Цена ↑</option>
              <option value="price_desc">Цена ↓</option>
              <option value="popularity">Популярность</option>
              <option value="newest">Новизна</option>
            </select>
          </div>

          <div className="checks">
            <label className="check">
              <input
                type="checkbox"
                checked={form.withFlight}
                onChange={(e) => setForm((p) => ({ ...p, withFlight: e.target.checked, page: 1 }))}
              />
              Туры с авиабилетами
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={form.availableOnly}
                onChange={(e) => setForm((p) => ({ ...p, availableOnly: e.target.checked, page: 1 }))}
              />
              Есть места в отеле
            </label>
          </div>

          <button className="btn btn-primary" onClick={() => handleSearch(1)}>
            Начать поиск
          </button>
        </div>
      </section>

      <section className="lists">
        <div className="list-card">
          <div className="list-title">Курорт</div>
          <div className="list-body">
            {!form.countryId ? (
              <div className="hint">Сначала выбери страну</div>
            ) : resorts.length ? (
              resorts.map((r) => (
                <label key={r.id} className="row-check">
                  <input
                    type="checkbox"
                    checked={form.resortIds.includes(String(r.id))}
                    onChange={() => onResortToggle(r.id)}
                  />
                  <span>{r.name}</span>
                </label>
              ))
            ) : (
              <div className="hint">Курорты не найдены</div>
            )}
          </div>
        </div>

        <div className="list-card">
          <div className="list-title">Отель</div>
          <div className="list-body">
            {!form.countryId ? (
              <div className="hint">Сначала выбери страну</div>
            ) : hotels.length ? (
              hotels.map((h) => (
                <label key={h.id} className="row-check">
                  <input
                    type="checkbox"
                    checked={form.hotelIds.includes(String(h.id))}
                    onChange={() => toggleId("hotelIds", h.id)}
                  />
                  <span>
                    {h.name} <span className="muted">({h.stars}★)</span>
                  </span>
                </label>
              ))
            ) : (
              <div className="hint">Отели не найдены</div>
            )}
          </div>
        </div>
      </section>

      <section className="results">
        <div className="results-bar">
          <div>
            Найдено: <b>{data.total}</b>
          </div>

          <div className="pager">
            <button
              className="btn"
              disabled={loading || data.page <= 1}
              onClick={() => handleSearch(data.page - 1)}
            >
              ←
            </button>
            <span className="pager-info">стр. {data.page}</span>
            <button
              className="btn"
              disabled={loading || data.page * data.pageSize >= data.total}
              onClick={() => handleSearch(data.page + 1)}
            >
              →
            </button>
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}

        {loading ? (
          <div className="loading">Загрузка...</div>
        ) : (
          <div className="cards">
            {data.items.map((t) => (
              <div key={t.id} className="card">
                <div className="card-img">
                  <img src={t.photos?.[0]} alt="" />
                  {t.is_hot ? <span className="badge">горящий</span> : null}
                </div>

                <div className="card-body">
                  <div className="card-title">{t.title}</div>
                  <div className="card-sub">
                    {t.country} / {t.resort}
                  </div>
                  <div className="card-sub">
                    {t.hotel} <span className="muted">({t.stars}★)</span>
                  </div>

                  <div className="card-meta">
                    <span>{t.start_date}</span>
                    <span>·</span>
                    <span>{t.nights} ноч.</span>
                    <span>·</span>
                    <span>{t.meal_code}</span>
                  </div>

                  <div className="card-bottom">
                    <div className="price">
                      {Number(t.price).toFixed(0)} <span className="muted">{t.currency}</span>
                    </div>

                    <div className="small-flags">
                      {t.with_flight ? <span className="flag">✈️</span> : null}
                      {t.available ? (
                        <span className="flag ok">есть места</span>
                      ) : (
                        <span className="flag bad">нет мест</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {!data.items.length && !loading ? <div className="hint">Ничего не найдено</div> : null}
          </div>
        )}
      </section>

      <footer className="footer">
        <span className="muted">oriontestfilter · frontend ↔ backend</span>
      </footer>
    </div>
  );
}
