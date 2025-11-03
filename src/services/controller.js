// src/services/controller.js
const Service = require("./modal");
const Category = require("../categories/modal");

// ---------- Helpers ----------
function escapeRegex(s = "") {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function ensureUniqueTitleInCategory({ title, categoryId, excludeId = null }) {
  if (!title || !categoryId) return false;
  const cond = {
    title: { $regex: `^${escapeRegex(title.trim())}$`, $options: "i" },
    category: categoryId,
  };
  if (excludeId) cond._id = { $ne: excludeId };
  const exists = await Service.findOne(cond).lean();
  return !!exists;
}

// ---------- List ----------
exports.listServices = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

    const q = (req.query.q || "").trim();
    const category = req.query.category || null;
    const status = req.query.status || null;

    const filter = {};
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
        { features: { $elemMatch: { $regex: q, $options: "i" } } },
      ];
    }
    if (category) filter.category = category;
    if (status) filter.status = status;

    const sortKey = (req.query.sort || "order").toString();
    const sort = sortKey === "createdAt" ? { createdAt: -1 } : { order: 1, createdAt: -1 };

    const [items, total] = await Promise.all([
      Service.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("category", "name slug")
        .populate("createdBy", "name email"),
      Service.countDocuments(filter),
    ]);

    res.json({ status: "success", data: items, total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Failed to fetch services" });
  }
};

// ---------- Get ----------
exports.getService = async (req, res) => {
  try {
    const item = await Service.findById(req.params.id)
      .populate("category", "name slug")
      .populate("createdBy", "name email");
    if (!item) return res.status(404).json({ message: "Service not found" });
    res.json({ status: "success", data: item });
  } catch {
    res.status(400).json({ message: "Invalid id" });
  }
};

// ---------- Create ----------
exports.createService = async (req, res) => {
  try {
    const { title, description, features, order, status, category } = req.body;

    if (!title) return res.status(400).json({ message: "title is required" });
    if (!category) return res.status(400).json({ message: "category is required" });

    // Validate category existence
    const cat = await Category.findById(category).lean();
    if (!cat) return res.status(400).json({ message: "Invalid category" });

    // Unique constraint: (title, category) case-insensitive
    const dup = await ensureUniqueTitleInCategory({ title, categoryId: category });
    if (dup) {
      return res
        .status(409)
        .json({ message: "Service with this title already exists in the selected category" });
    }

    // Image handling:
    // - If body.image is a base64 string => use it
    // - Else => set null
    let image = null;
    if (typeof req.body.image === "string" && req.body.image.trim()) {
      image = req.body.image.trim();
    } else {
      image = null;
    }

    const payload = {
      title: title.trim(),
      description: (description || "").trim(),
      features: Array.isArray(features)
        ? features
        : typeof features === "string"
        ? features.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      image,
      order: Number.isFinite(Number(order)) ? Number(order) : 0,
      status: status || "published",
      category,
      createdBy: req.user?._id || null, // <- set creator
    };

    const item = await Service.create(payload);
    const populated = await item.populate([
      { path: "category", select: "name slug" },
      { path: "createdBy", select: "name email" },
    ]);

    res.status(201).json({ status: "success", data: populated });
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: "Create failed" });
  }
};

// ---------- Update ----------
exports.updateService = async (req, res) => {
  try {
    const id = req.params.id;
    const update = { ...req.body };

    const current = await Service.findById(id).lean();
    if (!current) return res.status(404).json({ message: "Service not found" });

    // If category changes, validate
    if (update.category) {
      const cat = await Category.findById(update.category).lean();
      if (!cat) return res.status(400).json({ message: "Invalid category" });
    }

    // Enforce unique (title, category) if either changes
    if (update.title || update.category) {
      const title = (update.title ?? current.title) || "";
      const categoryId = (update.category ?? current.category)?.toString();
      const dup = await ensureUniqueTitleInCategory({
        title,
        categoryId,
        excludeId: current._id,
      });
      if (dup) {
        return res
          .status(409)
          .json({ message: "Service with this title already exists in the selected category" });
      }
    }

    // Normalize text fields
    if (update.title) update.title = update.title.trim();
    if (update.description !== undefined) update.description = (update.description || "").trim();

    // Features: accept array or comma string; if invalid, set empty array
    if (update.features !== undefined) {
      if (Array.isArray(update.features)) {
        update.features = update.features;
      } else if (typeof update.features === "string") {
        update.features = update.features.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        update.features = [];
      }
    }

    // Order
    if (update.order !== undefined) update.order = Number(update.order) || 0;

    // Image management:
    // - If "image" key is present:
    //     - if empty string / "null" / null -> set to null (clear)
    //     - if non-empty string (base64) -> set that value
    // - Else (no image key) -> do NOT touch image
    if (Object.prototype.hasOwnProperty.call(update, "image")) {
      if (
        update.image === null ||
        (typeof update.image === "string" && update.image.trim().length === 0) ||
        update.image === "null"
      ) {
        update.image = null;
      } else if (typeof update.image === "string") {
        update.image = update.image.trim();
      } else {
        update.image = null;
      }
    }

    const item = await Service.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
      context: "query",
    })
      .populate("category", "name slug")
      .populate("createdBy", "name email");

    res.json({ status: "success", data: item });
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: "Update failed" });
  }
};

// ---------- Delete ----------
exports.deleteService = async (req, res) => {
  try {
    const item = await Service.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "Service not found" });
    res.json({ message: "Deleted" });
  } catch {
    res.status(400).json({ message: "Delete failed" });
  }
};
