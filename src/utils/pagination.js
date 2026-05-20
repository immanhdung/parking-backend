/**
 * Reusable pagination utility
 */
class Pagination {
  constructor(query) {
    this.page = Math.max(1, parseInt(query.page) || 1);
    this.limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
    this.skip = (this.page - 1) * this.limit;
  }

  /**
   * Get paginated results from a Mongoose model
   * @param {Model} model - Mongoose model
   * @param {Object} filter - MongoDB filter
   * @param {Object} options - Options { sort, populate, select }
   */
  static async paginate(model, filter = {}, options = {}) {
    const { page = 1, limit = 10, sort = { createdAt: -1 }, populate = '', select = '' } = options;

    const skip = (page - 1) * limit;
    const total = await model.countDocuments(filter);

    let query = model.find(filter).sort(sort).skip(skip).limit(limit);

    if (select) query = query.select(select);
    if (populate) {
      const populations = Array.isArray(populate) ? populate : [populate];
      populations.forEach(p => { query = query.populate(p); });
    }

    const docs = await query.exec();

    return {
      docs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Build sort object from query string
   * e.g. "createdAt,-name" => { createdAt: 1, name: -1 }
   */
  static buildSort(sortQuery) {
    if (!sortQuery) return { createdAt: -1 };
    const sortFields = sortQuery.split(',');
    const sort = {};
    sortFields.forEach(field => {
      if (field.startsWith('-')) {
        sort[field.slice(1)] = -1;
      } else {
        sort[field] = 1;
      }
    });
    return sort;
  }
}

module.exports = Pagination;
