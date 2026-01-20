const { Op } = require('sequelize');

function coerceValue(v) {
  if (Array.isArray(v)) return v.map(coerceValue);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

function buildWhere(reqQuery) {
  const where = {};

  for (const [key, raw] of Object.entries(reqQuery || {})) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const ops = {};
      for (const [opKey, opVal] of Object.entries(raw)) {
        const val = coerceValue(opVal);
        if (opKey === 'gt') ops[Op.gt] = val;
        else if (opKey === 'gte') ops[Op.gte] = val;
        else if (opKey === 'lt') ops[Op.lt] = val;
        else if (opKey === 'lte') ops[Op.lte] = val;
        else if (opKey === 'in') ops[Op.in] = Array.isArray(val) ? val : String(val).split(',').map((s) => s.trim()).filter(Boolean);
      }
      where[key] = ops;
    } else {
      where[key] = coerceValue(raw);
    }
  }

  return where;
}

function buildOrder(sortStr) {
  if (!sortStr) return [['createdAt', 'DESC']];

  return String(sortStr)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((field) => {
      if (field.startsWith('-')) return [field.slice(1), 'DESC'];
      return [field, 'ASC'];
    });
}

function buildAttributes(selectStr) {
  if (!selectStr) return undefined;
  return String(selectStr)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildInclude(model, populate) {
  if (!populate) return undefined;
  const path = populate?.path;
  if (!path) return undefined;

  const assoc = model?.associations?.[path];
  if (!assoc) return undefined;

  const attrs = populate?.select
    ? String(populate.select)
        .split(' ')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  return [{ association: path, attributes: attrs }];
}

const advancedResults = (model, populate) => async (req, res, next) => {
  // Create a copy of req.query
  const reqQuery = { ...req.query };

  // Fields to exclude from filtering
  const removeFields = ['select', 'sort', 'page', 'limit'];
  removeFields.forEach((param) => delete reqQuery[param]);

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;

  const where = buildWhere(reqQuery);
  const attributes = buildAttributes(req.query.select);
  const order = buildOrder(req.query.sort);
  const include = buildInclude(model, populate);

  const { count: total, rows } = await model.findAndCountAll({
    where,
    attributes,
    order,
    limit,
    offset: startIndex,
    include,
  });

  const pagination = {};
  if (endIndex < total) {
    pagination.next = { page: page + 1, limit };
  }
  if (startIndex > 0) {
    pagination.prev = { page: page - 1, limit };
  }

  res.advancedResults = {
    success: true,
    count: rows.length,
    pagination,
    data: rows.map((r) => (typeof r?.toJSON === 'function' ? r.toJSON() : r)),
  };

  next();
};

module.exports = advancedResults;
