// src/news/controller.js
const News = require("./modal");

/* ------------------------- Helpers (same style) ------------------------- */
function escapeRegex(s = "") {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseMaybeJSON(value, fallback) {
    if (value === undefined) return fallback;
    if (Array.isArray(value) || typeof value === "object") return value;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return fallback;
        try {
            return JSON.parse(trimmed);
        } catch {
            return fallback;
        }
    }
    return fallback;
}

function coerceString(v, def = "") {
    if (v === undefined || v === null) return def;
    return String(v).trim();
}

function coerceNullableString(v) {
    if (v === undefined) return undefined; // leave as-is on update
    if (v === null || String(v).trim() === "" || v === "null") return null;
    return String(v).trim();
}

function coerceNumber(v, def = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

function coerceDate(v) {
    if (!v && v !== 0) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

// Map multer file to URL
const fileToUrl = (f) => (f ? `/uploads/${f.filename}` : null);

// Get first file by field name from req.files (upload.fields)
const pickFile = (req, field) => {
    const arr = req?.files?.[field];
    return Array.isArray(arr) && arr.length ? arr[0] : null;
};

/**
 * When items are sent as FormData with fields like:
 * items[0][image] -> (binary)
 * this scans req.files and returns a map { 0: "/uploads/xxx.jpg", 1: "...", ... }
 */
function mapItemFileUploads(req) {
    const res = {};
    const files = req?.files || {};
    const keyRe = /^items\[(\d+)\]\[image\]$/; // match "items[<idx>][image]"
    Object.keys(files).forEach((k) => {
        const m = k.match(keyRe);
        if (!m) return;
        const idx = Number(m[1]);
        const f = pickFile(req, k);
        if (f) res[idx] = fileToUrl(f);
    });
    return res;
}

/* ------------------------------- List ------------------------------- */
exports.listNews = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || "1", 10), 1);
        const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);

        const q = coerceString(req.query.q);
        const status = coerceString(req.query.status);
        const sortKey = (req.query.sort || "order").toString();

        const filter = {};
        if (q) {
            filter.$or = [
                { title: { $regex: q, $options: "i" } },
                { description: { $regex: q, $options: "i" } },
                { "items.title": { $regex: q, $options: "i" } },
                { "items.description": { $regex: q, $options: "i" } },
                { "items.author": { $regex: q, $options: "i" } },
            ];
        }
        if (status) filter.status = status;

        const sort =
            sortKey === "createdAt"
                ? { createdAt: -1 }
                : sortKey === "updatedAt"
                    ? { updatedAt: -1 }
                    : { order: 1, createdAt: -1 };

        const [items, total] = await Promise.all([
            News.find(filter)
                .sort(sort)
                .skip((page - 1) * limit)
                .limit(limit)
                .populate("createdBy", "name email"),
            News.countDocuments(filter),
        ]);

        res.json({
            status: "success",
            data: items,
            total,
            page,
            pages: Math.ceil(total / limit),
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Failed to fetch news" });
    }
};

/* -------------------------------- Get -------------------------------- */
exports.getNews = async (req, res) => {
    try {
        const item = await News.findById(req.params.id).populate("createdBy", "name email");
        if (!item) return res.status(404).json({ message: "News not found" });
        res.json({ status: "success", data: item });
    } catch {
        res.status(400).json({ message: "Invalid id" });
    }
};

/* ------------------------- Create (upload-aware) ------------------------- */
exports.createNews = async (req, res) => {
    try {
        // ---------- Singleton guard ----------
        const existing = await News.findOne().select("_id title").lean();
        if (existing) {
            return res.status(409).json({
                code: "NEWS_EXISTS",
                message: "news page data already exist",
                existingId: existing._id,
                existingTitle: existing.title || "",
            });
        }

        const body = req.body || {};

        // Core
        const payload = {
            title: coerceString(body.title),
            description: coerceString(body.description),
            status: coerceString(body.status) || "draft",
            order: coerceNumber(body.order, 0),
            createdBy: req.user?._id || null,
        };

        if (!payload.title) return res.status(400).json({ message: "title is required" });

        // items can arrive as JSON string or bracketed FormData (items[0][...])
        const rawItems = parseMaybeJSON(body.items, body.items);
        let items = Array.isArray(rawItems) ? rawItems : [];

        // Normalize & coerce fields:
        items = items
            .map((it) => ({
                date: coerceDate(it?.date) || new Date(), // default to now if invalid
                author: coerceString(it?.author || "News Desk"),
                title: coerceString(it?.title),
                image: it?.image === undefined ? null : coerceNullableString(it.image),
                description: coerceString(it?.description),
                fullNews: coerceString(it?.fullNews),
                order: coerceNumber(it?.order, 0),
            }))
            .filter((it) => it.title && it.fullNews);

        // Uploaded files for items[n][image] override any string values
        const fileMap = mapItemFileUploads(req);
        items = items.map((it, idx) => ({
            ...it,
            image: fileMap[idx] ?? it.image,
        }));

        payload.items = items;

        const created = await News.create(payload);
        const populated = await created.populate([{ path: "createdBy", select: "name email" }]);

        res.status(201).json({ status: "success", data: populated });
    } catch (e) {
        console.error(e);
        res.status(400).json({ message: "Create failed" });
    }
};

/* ------------------------- Update (upload-aware) ------------------------- */
exports.updateNews = async (req, res) => {
    try {
        const id = req.params.id;
        const current = await News.findById(id).lean();
        if (!current) return res.status(404).json({ message: "News not found" });

        const body = req.body || {};
        const update = {};

        if (body.title !== undefined) update.title = coerceString(body.title);
        if (body.description !== undefined) update.description = coerceString(body.description);
        if (body.status !== undefined) update.status = coerceString(body.status) || current.status;
        if (body.order !== undefined) update.order = coerceNumber(body.order, current.order);

        // Update items if provided
        if (body.items !== undefined) {
            const raw = parseMaybeJSON(body.items, body.items);
            let nextItems = Array.isArray(raw)
                ? raw
                    .map((it) => ({
                        date: coerceDate(it?.date) || new Date(),
                        author: coerceString(it?.author || "News Desk"),
                        title: coerceString(it?.title),
                        image: it?.image === undefined ? null : coerceNullableString(it.image),
                        description: coerceString(it?.description),
                        fullNews: coerceString(it?.fullNews),
                        order: coerceNumber(it?.order, 0),
                    }))
                    .filter((it) => it.title && it.fullNews)
                : [];

            // Uploaded files override item images
            const fileMap = mapItemFileUploads(req);
            nextItems = nextItems.map((it, idx) => ({
                ...it,
                image: fileMap[idx] ?? it.image,
            }));

            update.items = nextItems;
        } else {
            // Even when items are not part of body, uploaded files might target existing items.
            const fileMap = mapItemFileUploads(req);
            if (Object.keys(fileMap).length) {
                // Patch current.items with uploaded images by index
                const patched = (current.items || []).map((it, idx) => ({
                    ...it,
                    image: fileMap[idx] ?? it.image,
                }));
                update.items = patched;
            }
        }

        const item = await News.findByIdAndUpdate(id, update, {
            new: true,
            runValidators: true,
            context: "query",
        }).populate("createdBy", "name email");

        res.json({ status: "success", data: item });
    } catch (e) {
        console.error(e);
        res.status(400).json({ message: "Update failed" });
    }
};

/* -------------------------------- Delete -------------------------------- */
exports.deleteNews = async (req, res) => {
    try {
        const item = await News.findByIdAndDelete(req.params.id);
        if (!item) return res.status(404).json({ message: "News not found" });
        res.json({ message: "Deleted" });
    } catch {
        res.status(400).json({ message: "Delete failed" });
    }
};
