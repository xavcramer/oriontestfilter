const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "postgres",
  password: "1234",
  port: 5432,
  options: "-c search_path=orionfilter",
});

// ---------- helpers ----------
function intOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function numOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  if (v === true || v === false) return v;
  if (String(v).toLowerCase() === "true") return true;
  if (String(v).toLowerCase() === "false") return false;
  return null;
}

function csvToIntArray(v) {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => parseInt(x, 10))
    .filter(Number.isFinite);
}

function pickCurrency(v) {
  const cur = String(v || "rub").toLowerCase();
  return cur === "usd" ? "usd" : "rub";
}

function pickSort(v) {
  switch (v) {
    case "price_desc":
      return { sql: `(t.price_rub / cr.rate_to_rub) DESC, t.id DESC` };
    case "popularity":
      return { sql: `t.popularity DESC, t.id DESC` };
    case "newest":
      return { sql: `t.created_at DESC, t.id DESC` };
    case "price_asc":
    default:
      return { sql: `(t.price_rub / cr.rate_to_rub) ASC, t.id DESC` };
  }
}

function anyToIntArray(v) {
  // принимает: [1,2], ["1","2"], "1,2"
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.map((x) => parseInt(String(x), 10)).filter(Number.isFinite);
  }
  return String(v)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => parseInt(x, 10))
    .filter(Number.isFinite);
}

function pickCurrency(v) {
  const cur = String(v || "rub").toLowerCase();
  return cur === "usd" ? "usd" : "rub";
}

function pickSortSql(v) {
  switch (v) {
    case "price_desc":
      return `(t.price_rub / cr.rate_to_rub) DESC, t.id DESC`;
    case "popularity":
      return `t.popularity DESC, t.id DESC`;
    case "newest":
      return `t.created_at DESC, t.id DESC`;
    case "price_asc":
    default:
      return `(t.price_rub / cr.rate_to_rub) ASC, t.id DESC`;
  }
}

async function runToursSearch(raw) {
  // pagination
  const page = Math.max(1, intOrNull(raw.page) || 1);
  const pageSize = Math.min(60, Math.max(1, intOrNull(raw.pageSize) || 12));
  const offset = (page - 1) * pageSize;

  // filters
  const currency = pickCurrency(raw.currency);
  const sortSql = pickSortSql(raw.sort);

  const fromId = intOrNull(raw.fromId);
  const countryId = intOrNull(raw.countryId);

  const dateFrom = raw.dateFrom ? String(raw.dateFrom) : null; // YYYY-MM-DD
  const dateTo = raw.dateTo ? String(raw.dateTo) : null;

  const nightsMin = intOrNull(raw.nightsMin);
  const nightsMax = intOrNull(raw.nightsMax);

  const adults = intOrNull(raw.adults);
  const children = intOrNull(raw.children);

  const starsMin = intOrNull(raw.starsMin);
  const mealPlanId = intOrNull(raw.mealPlanId);

  const priceMin = numOrNull(raw.priceMin);
  const priceMax = numOrNull(raw.priceMax);

  const resortIds = anyToIntArray(raw.resortIds);
  const hotelIds = anyToIntArray(raw.hotelIds);

  const withFlight = boolOrNull(raw.withFlight);
  const availableOnly = boolOrNull(raw.availableOnly);

  // build SQL
  const where = [];
  const values = [];
  let i = 1;

  // валюта нужна для JOIN currency_rate
  values.push(currency);
  const currencyParam = `$${i++}`;

  if (fromId) {
    values.push(fromId);
    where.push(`t.departure_city_id = $${i++}`);
  }
  if (countryId) {
    values.push(countryId);
    where.push(`t.country_id = $${i++}`);
  }
  if (dateFrom) {
    values.push(dateFrom);
    where.push(`t.start_date >= $${i++}::date`);
  }
  if (dateTo) {
    values.push(dateTo);
    where.push(`t.start_date <= $${i++}::date`);
  }
  if (nightsMin) {
    values.push(nightsMin);
    where.push(`t.nights >= $${i++}`);
  }
  if (nightsMax) {
    values.push(nightsMax);
    where.push(`t.nights <= $${i++}`);
  }
  if (mealPlanId) {
    values.push(mealPlanId);
    where.push(`t.meal_plan_id = $${i++}`);
  }
  if (starsMin) {
    values.push(starsMin);
    where.push(`h.stars >= $${i++}`);
  }

  if (resortIds.length) {
    values.push(resortIds);
    where.push(`t.resort_id = ANY($${i++}::int[])`);
  }
  if (hotelIds.length) {
    values.push(hotelIds);
    where.push(`t.hotel_id = ANY($${i++}::int[])`);
  }

  if (withFlight !== null) {
    values.push(withFlight);
    where.push(`t.with_flight = $${i++}`);
  }
  if (availableOnly) {
    where.push(`t.available = TRUE`);
  }

  // вместимость
  if (adults) {
    values.push(adults);
    where.push(`h.max_adults >= $${i++}`);
  }
  if (children !== null) {
    values.push(children);
    where.push(`h.max_children >= $${i++}`);
  }

  // price in selected currency: t.price_rub / cr.rate_to_rub
  if (priceMin !== null) {
    values.push(priceMin);
    where.push(`(t.price_rub / cr.rate_to_rub) >= $${i++}`);
  }
  if (priceMax !== null) {
    values.push(priceMax);
    where.push(`(t.price_rub / cr.rate_to_rub) <= $${i++}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const baseFrom = `
    FROM tour t
    JOIN hotel h ON h.id = t.hotel_id
    JOIN country c ON c.id = t.country_id
    JOIN resort r ON r.id = t.resort_id
    JOIN meal_plan mp ON mp.id = t.meal_plan_id
    JOIN currency_rate cr ON cr.code = ${currencyParam}
  `;

  // list query (добавляем limit/offset)
  const listValues = values.slice();
  listValues.push(pageSize);
  const limitParam = `$${i++}`;
  listValues.push(offset);
  const offsetParam = `$${i++}`;

  const listSql = `
    SELECT
      t.id, t.title, t.start_date, t.nights,
      (t.price_rub / cr.rate_to_rub) AS price,
      cr.code AS currency,
      t.with_flight, t.available, t.is_hot, t.popularity,
      c.name AS country, r.name AS resort,
      h.name AS hotel, h.stars,
      mp.code AS meal_code, mp.name AS meal_name,
      t.photos
    ${baseFrom}
    ${whereSql}
    ORDER BY ${sortSql}
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS total
    ${baseFrom}
    ${whereSql}
  `;

  const [list, count] = await Promise.all([
    pool.query(listSql, listValues),
    pool.query(countSql, values),
  ]);

  return {
    page,
    pageSize,
    total: count.rows[0]?.total || 0,
    items: list.rows,
  };
}

// ---------- meta ----------
app.get("/api/meta/departures", async (_, res) => {
  try {
    const r = await pool.query(`SELECT id, name FROM departure_city ORDER BY name`);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "departures_failed" });
  }
});

app.get("/api/meta/countries", async (_, res) => {
  try {
    const r = await pool.query(`SELECT id, name FROM country ORDER BY name`);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "countries_failed" });
  }
});

app.get("/api/meta/resorts", async (req, res) => {
  try {
    const countryId = intOrNull(req.query.countryId);
    const r = await pool.query(
      `
      SELECT id, name
      FROM resort
      WHERE ($1::int IS NULL OR country_id = $1::int)
      ORDER BY name
      `,
      [countryId]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "resorts_failed" });
  }
});

app.get("/api/meta/hotels", async (req, res) => {
  try {
    const resortIds = csvToIntArray(req.query.resortIds);
    const r = await pool.query(
      `
      SELECT id, name, stars, resort_id
      FROM hotel
      WHERE ($1::int[] IS NULL OR resort_id = ANY($1::int[]))
      ORDER BY stars DESC, name
      `,
      [resortIds.length ? resortIds : null]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "hotels_failed" });
  }
});

app.get("/api/meta/meal-plans", async (_, res) => {
  try {
    const r = await pool.query(`SELECT id, code, name FROM meal_plan ORDER BY id`);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "meal_plans_failed" });
  }
});

// ---------- tours filtering ----------
app.get("/api/tours", async (req, res) => {
  try {
    // pagination
    const page = Math.max(1, intOrNull(req.query.page) || 1);
    const pageSizeRaw = intOrNull(req.query.pageSize) || 12;
    const pageSize = Math.min(60, Math.max(1, pageSizeRaw));
    const offset = (page - 1) * pageSize;

    // filters
    const currency = pickCurrency(req.query.currency);
    const sort = pickSort(req.query.sort);

    const fromId = intOrNull(req.query.fromId);
    const countryId = intOrNull(req.query.countryId);

    const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : null; // YYYY-MM-DD
    const dateTo = req.query.dateTo ? String(req.query.dateTo) : null;

    const nightsMin = intOrNull(req.query.nightsMin);
    const nightsMax = intOrNull(req.query.nightsMax);

    const adults = intOrNull(req.query.adults);
    const children = intOrNull(req.query.children);

    const starsMin = intOrNull(req.query.starsMin);
    const mealPlanId = intOrNull(req.query.mealPlanId);

    const priceMin = numOrNull(req.query.priceMin);
    const priceMax = numOrNull(req.query.priceMax);

    const resortIds = csvToIntArray(req.query.resortIds);
    const hotelIds = csvToIntArray(req.query.hotelIds);

    const withFlight = boolOrNull(req.query.withFlight);
    const availableOnly = boolOrNull(req.query.availableOnly);

    // build dynamic SQL
    const where = [];
    const values = [];
    let i = 1;

    // currency join param (always present)
    values.push(currency);
    const currencyParam = `$${i++}`;

    if (fromId) {
      values.push(fromId);
      where.push(`t.departure_city_id = $${i++}`);
    }

    if (countryId) {
      values.push(countryId);
      where.push(`t.country_id = $${i++}`);
    }

    if (dateFrom) {
      values.push(dateFrom);
      where.push(`t.start_date >= $${i++}::date`);
    }

    if (dateTo) {
      values.push(dateTo);
      where.push(`t.start_date <= $${i++}::date`);
    }

    if (nightsMin) {
      values.push(nightsMin);
      where.push(`t.nights >= $${i++}`);
    }

    if (nightsMax) {
      values.push(nightsMax);
      where.push(`t.nights <= $${i++}`);
    }

    if (mealPlanId) {
      values.push(mealPlanId);
      where.push(`t.meal_plan_id = $${i++}`);
    }

    if (starsMin) {
      values.push(starsMin);
      where.push(`h.stars >= $${i++}`);
    }

    if (resortIds.length) {
      values.push(resortIds);
      where.push(`t.resort_id = ANY($${i++}::int[])`);
    }

    if (hotelIds.length) {
      values.push(hotelIds);
      where.push(`t.hotel_id = ANY($${i++}::int[])`);
    }

    if (withFlight !== null) {
      values.push(withFlight);
      where.push(`t.with_flight = $${i++}`);
    }

    if (availableOnly) {
      where.push(`t.available = TRUE`);
    }

    // вместимость (простая проверка по полям отеля)
    if (adults) {
      values.push(adults);
      where.push(`h.max_adults >= $${i++}`);
    }
    if (children !== null) {
      values.push(children);
      where.push(`h.max_children >= $${i++}`);
    }

    // price in chosen currency: t.price_rub / cr.rate_to_rub
    if (priceMin !== null) {
      values.push(priceMin);
      where.push(`(t.price_rub / cr.rate_to_rub) >= $${i++}`);
    }
    if (priceMax !== null) {
      values.push(priceMax);
      where.push(`(t.price_rub / cr.rate_to_rub) <= $${i++}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const baseFrom = `
      FROM tour t
      JOIN hotel h ON h.id = t.hotel_id
      JOIN country c ON c.id = t.country_id
      JOIN resort r ON r.id = t.resort_id
      JOIN meal_plan mp ON mp.id = t.meal_plan_id
      JOIN currency_rate cr ON cr.code = ${currencyParam}
    `;

    // list query (adds limit/offset)
    const valuesForList = values.slice();
    valuesForList.push(pageSize);
    const limitParam = `$${i++}`;
    valuesForList.push(offset);
    const offsetParam = `$${i++}`;

    const listSql = `
      SELECT
        t.id, t.title, t.start_date, t.nights,
        (t.price_rub / cr.rate_to_rub) AS price,
        cr.code AS currency,
        t.with_flight, t.available, t.is_hot, t.popularity,
        c.name AS country, r.name AS resort,
        h.name AS hotel, h.stars,
        mp.code AS meal_code, mp.name AS meal_name,
        t.photos
      ${baseFrom}
      ${whereSql}
      ORDER BY ${sort.sql}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      ${baseFrom}
      ${whereSql}
    `;

    const [list, count] = await Promise.all([
      pool.query(listSql, valuesForList),
      pool.query(countSql, values),
    ]);

    res.json({
      page,
      pageSize,
      total: count.rows[0]?.total || 0,
      items: list.rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "tours_failed" });
  }
});
app.post("/api/meta/hotels", async (req, res) => {
  try {
    const resortIds = (req.body?.resortIds || [])
      .map((x) => parseInt(String(x), 10))
      .filter(Number.isFinite);

    const r = await pool.query(
      `
      SELECT id, name, stars, resort_id
      FROM hotel
      WHERE ($1::int[] IS NULL OR resort_id = ANY($1::int[]))
      ORDER BY stars DESC, name
      `,
      [resortIds.length ? resortIds : null]
    );

    res.json(r.rows);
  } catch (e) {
    console.error("HOTELS POST ERROR:", e.message);
    res.status(500).json({ error: "hotels_failed" });
  }
});

// POST /api/tours/search  (тело: фильтры)
app.post("/api/tours/search", async (req, res) => {
  try {
    const result = await runToursSearch(req.body || {});
    res.json(result);
  } catch (e) {
    console.error("TOURS POST ERROR:", e.message);
    res.status(500).json({ error: "tours_failed" });
  }
});

app.get("/api/health", (_, res) => res.json({ ok: true }));

const PORT = 4000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
